/* Sunodukaan — always-on shop voice analytics */
(() => {
  'use strict';

  // ----------- Storage ------------
  const KEY = 'sunodukaan.v1';
  // Default Bifrost gateway key for out-of-the-box use.
  // Replace with your own in Settings if this one is rotated / rate-limited.
  const DEFAULT_API_KEY = 'sk-bf-f9ece2ee-5cb2-4da8-b361-08c98c72e597';
  const DEFAULT_STATE = {
    settings: {
      lang: 'hi-IN',
      autoRestart: true,
      apiKey: DEFAULT_API_KEY,
      model: 'gpt-5.5',
      asrMode: 'whisper',            // 'whisper' | 'browser'
      whisperModel: 'whisper-1',
      vadSensitivity: 'medium',      // 'low' | 'medium' | 'high'
    },
    interactions: [],   // {id, ts, product, outcome, price, reason, snippet, notes, source}
    transcript: [],     // {id, ts, text}
    pending: [],        // {id, ts, text} — chunks waiting for AI processing
  };
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      const merged = {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      };
      // If a returning user had an empty key saved, fall back to the shipped default.
      if (!merged.settings.apiKey || !merged.settings.apiKey.trim()) {
        merged.settings.apiKey = DEFAULT_API_KEY;
      }
      return merged;
    } catch (e) {
      console.error('load failed', e);
      return structuredClone(DEFAULT_STATE);
    }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const nowISO = () => new Date().toISOString();
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const dayOf = ts => ts.slice(0, 10);
  const timeFmt = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateFmt = ts => new Date(ts).toLocaleDateString();

  // ----------- Bifrost gateway endpoints ------------
  const AI_ENDPOINT = 'https://gateway-buildathon.ltl.sh/v1/chat/completions';
  const TRANSCRIBE_ENDPOINT = 'https://gateway-buildathon.ltl.sh/v1/audio/transcriptions';
  const AVAILABLE_MODELS = ['gpt-5.5', 'gpt-4o'];
  const AI_SYSTEM = `You extract structured retail-shop customer interactions from short conversation snippets between a shopkeeper (kirana / grocery / FMCG store owner in India) and their customers. The speech will be in Hindi, English, Hinglish (mixed), or another Indian language. The transcript is imperfect — expect misspellings, spoken numerals, brand names, and casual grammar.

RETURN VALID JSON ONLY. No preamble, no code fences, no explanation.

Schema:
{
  "interactions": [
    {
      "product": "<English product name — normalize brand+category, e.g. 'Dettol Soap', 'Amul Milk', 'Sugar', 'Parle-G Biscuits'>",
      "outcome": "sold" | "lost_expensive_here" | "lost_cheaper_elsewhere" | "lost_other" | "oos" | "unclear",
      "price": <number in INR or null>,
      "reason": "<short human-readable reason or null>",
      "snippet": "<the verbatim spoken text that supports this interaction, ≤200 chars>"
    }
  ]
}

Outcome definitions (very important — classify carefully):
- sold: the customer clearly decided to buy (phrases like "de do", "pack karo", "theek hai", "le lunga", "chalo", "ok").
- lost_expensive_here: customer refused because THIS SHOP'S price is too high ("mahenga hai", "zyada hai", "itna nahi", "kam karo", "discount do").
- lost_cheaper_elsewhere: customer said they can get it cheaper somewhere else ("wahan sasta milta hai", "dusri dukan pe sasta", "aur jagah kam mein").
- lost_other: customer did not buy for some other reason (not needed now, will come back later, just asking, changed mind) — NOT because of price and NOT because you were out of stock.
- oos: the SHOPKEEPER said the item is not in stock, will come tomorrow, is finished, etc. ("nahi hai", "khatam ho gaya", "kal aayega", "stock nahi"). This means reorder.
- unclear: a product was clearly mentioned but the outcome cannot be determined from the snippet.

Rules for extraction:
1. Only extract interactions where a REAL product is discussed. Ignore pure chit-chat, greetings, weather talk.
2. If several products are discussed in the same snippet, return one interaction per product.
3. Normalize product names to their standard English name. If a brand is spoken, keep it in the name ("Dettol Soap", not just "Soap"). Preserve size / quantity if mentioned ("Vaseline Body Lotion 100ml").
4. Prices: capture the number the shopkeeper quoted or the number the customer heard. If spoken in words (e.g., "पैंतालीस"), convert to digits. If no price is mentioned, use null.
5. If the classification would be lost_expensive_here vs lost_cheaper_elsewhere and both signals appear, prefer lost_cheaper_elsewhere (it's the more specific reason).
6. Do not invent outcomes. If truly ambiguous, use "unclear".
7. If nothing product-related is found, return {"interactions": []}.

🛑 STOP OVER-CLASSIFYING AS "sold" — these safety rails override the outcome definitions above:
- If the entire input is fewer than 5 words OR looks garbled / incomplete (just noise words like "haan hai theek hai" with no product context) → return {"interactions": []}. Do NOT invent a product or a sale.
- A "sold" outcome requires TWO independent signals in the transcript:
    (a) an affirmation from the customer ("haan", "theek hai", "chalo", "ok", "de do", "le lunga"), AND
    (b) either a price mentioned by the shopkeeper OR an explicit purchase verb aimed at this shop ("de do", "pack karo", "le lunga", "lena hai", "pack it").
  If only (a) is present without (b), classify as "unclear" — not "sold".
- If the shopkeeper quoted a price but the customer never explicitly confirmed, that is NOT a sale — it is either "unclear" or "lost_*" depending on other signals. Do not assume the sale went through just because a price was mentioned.
- If the transcript contains any refusal cue at all ("mahenga", "sasta", "chodo", "rehne do", "nahi", "wahan mil raha", "usse le lo") → the outcome cannot be "sold" even if the very last word was "theek hai".
- DEFAULT BIAS: when torn between "sold" and any other outcome, pick the other outcome. When torn between "unclear" and "sold", pick "unclear".

⚠️ CRITICAL — resolve who is agreeing with whom before classifying:
- A "sold" outcome ONLY applies when the customer commits to buying FROM THIS SHOP. Phrases like "theek hai", "le lete hain", "ok", "haan", "chalo" are AMBIGUOUS on their own — you must check the immediately preceding context.
- If the shopkeeper says "उससे ले लो" / "wahan se le lo" / "usse le lo" / "unse le lo" / "go take from him" / "take from that shop" — this is the shopkeeper telling the customer to buy from a COMPETITOR. If the customer then says "ठीक है" / "theek hai" / "le lete hain" / "ok" — the customer is agreeing to leave. Classify as lost_cheaper_elsewhere (or lost_other if no competitor price was quoted).
- Similarly, if the customer previously mentioned another shop's lower price and the shopkeeper does not match it, a following "theek hai le lete hain" almost always means "OK, I'll take (from the other place)" — NOT a sale.
- The word "बाजू वाला दुकान" / "baju wala dukaan" / "bagal ki dukaan" / "next-door shop" is an explicit competitor reference — factor it in.
- When the shopkeeper says "मेरे पास तो X ka hi hai" ("mine is only for X") followed by suggesting the other shop, they are refusing to negotiate, and the interaction is not going to end in a sale UNLESS the customer says something like "chalo phir bhi de do" / "OK phir bhi le lunga" / an explicit reversal.
- When in doubt between sold vs lost_cheaper_elsewhere and a competitor was named in the same conversation, prefer lost_cheaper_elsewhere.

Reasoning: before choosing an outcome, mentally list — (a) who last spoke, (b) whether they were agreeing to buy from THIS shop or from a competitor mentioned earlier. Only mark "sold" when you are confident the commitment is to this shop.

Examples:
- "sugar hai kya? haan 45 rupaye. mahenga hai chodo" → {"interactions":[{"product":"Sugar","outcome":"lost_expensive_here","price":45,"reason":"Customer said price too high","snippet":"sugar hai kya? haan 45 rupaye. mahenga hai chodo"}]}
- "dettol soap chahiye" / "nahi hai kal aayega" → {"interactions":[{"product":"Dettol Soap","outcome":"oos","price":null,"reason":"Not in stock — kal aayega","snippet":"dettol soap chahiye ... nahi hai kal aayega"}]}
- "parle-g bada packet dena 20 ka. haan pack karo" → {"interactions":[{"product":"Parle-G Biscuits","outcome":"sold","price":20,"reason":null,"snippet":"parle-g bada packet dena 20 ka. haan pack karo"}]}
- "amul milk aur bread, milk 30 aur bread 40. bread aur jagah 30 mein milta hai, sirf milk de do" → {"interactions":[{"product":"Amul Milk","outcome":"sold","price":30,"reason":null,"snippet":"..."},{"product":"Bread","outcome":"lost_cheaper_elsewhere","price":40,"reason":"Customer said it's cheaper at another shop","snippet":"..."}]}
- "vaseline body lotion 100ml hai? 30 ka hai. bagal wale dukaan wala to 25 mein de raha hai, mahenga lag rahe ho. mere pas to 30 ka hi hai, usse 25 mein mil raha to usse le lo. theek hai bhaiya le lete hain" → {"interactions":[{"product":"Vaseline Body Lotion 100ml","outcome":"lost_cheaper_elsewhere","price":30,"reason":"Customer went to next-door shop offering ₹25","snippet":"...usse 25 mein mil raha to usse le lo. theek hai bhaiya le lete hain"}]}
- "colgate 50 ka hai. mahenga hai. lagta hai wahi le lete hain aur jagah se" → {"interactions":[{"product":"Colgate Toothpaste","outcome":"lost_cheaper_elsewhere","price":50,"reason":"Customer decided to buy from another shop","snippet":"..."}]}
- "maggi 15 ka. theek hai de do" → {"interactions":[{"product":"Maggi","outcome":"sold","price":15,"reason":null,"snippet":"..."}]}
- "atta 5kg ka bag, 250. haan theek hai le lete hain, pack kar do" → {"interactions":[{"product":"Wheat Flour 5kg","outcome":"sold","price":250,"reason":null,"snippet":"..."}]}
`;

  async function aiExtract(chunkText) {
    const key = state.settings.apiKey?.trim();
    if (!key) throw new Error('No API key set');
    const model = AVAILABLE_MODELS.includes(state.settings.model) ? state.settings.model : 'gpt-5.5';
    const body = {
      model,
      max_tokens: 1024,
      temperature: 0,
      messages: [
        { role: 'system', content: AI_SYSTEM },
        { role: 'user', content: `Conversation:\n"""\n${chunkText}\n"""\nExtract interactions as JSON.` },
      ],
    };
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`AI request failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    let parsed;
    try { parsed = JSON.parse(match[0]); }
    catch { return []; }
    return Array.isArray(parsed.interactions) ? parsed.interactions : [];
  }

  // ----------- Interaction pipeline ------------
  // Group utterances by time gaps then extract when a gap exceeds threshold.
  const GAP_MS = 12000; // 12s of silence closes the chunk
  const MIN_CHUNK_CHARS = 5;
  let pendingUtterances = [];
  let gapTimer = null;

  function addUtterance(text) {
    if (!text) return;
    const utt = { id: uid(), ts: nowISO(), text: text.trim() };
    state.transcript.push(utt);
    pendingUtterances.push(utt);
    // trim transcript history if too long
    if (state.transcript.length > 2000) state.transcript.splice(0, state.transcript.length - 2000);
    save();
    renderTranscript();
    scheduleFlush();
  }

  function scheduleFlush() {
    if (gapTimer) clearTimeout(gapTimer);
    gapTimer = setTimeout(flushChunk, GAP_MS);
  }

  async function flushChunk() {
    gapTimer = null;
    if (pendingUtterances.length === 0) return;
    const chunk = pendingUtterances;
    pendingUtterances = [];
    const joined = chunk.map(u => u.text).join(' ').trim();
    if (joined.length < MIN_CHUNK_CHARS) return;

    if (!state.settings.apiKey) {
      // No key set — save the chunk to the pending queue so nothing is lost.
      state.pending.push({ id: uid(), ts: chunk[0].ts, text: joined });
      save();
      renderAll();
      showKeyMissingBanner();
      return;
    }

    await extractAndStore(chunk[0].ts, joined);
  }

  async function extractAndStore(ts, text) {
    let items = [];
    try {
      items = await aiExtract(text);
    } catch (e) {
      console.error('AI extraction failed', e);
      toast('AI extraction failed: ' + e.message.slice(0, 80));
      // Queue for retry
      state.pending.push({ id: uid(), ts, text });
      save();
      renderAll();
      return;
    }
    for (const it of items) {
      if (!it || !it.product) continue;
      state.interactions.push({
        id: uid(),
        ts,
        product: it.product,
        outcome: it.outcome || 'unclear',
        price: (it.price ?? null),
        reason: it.reason || null,
        snippet: it.snippet || text.slice(0, 240),
        notes: '',
        source: 'ai',
      });
    }
    save();
    renderAll();
  }

  async function processPending() {
    if (!state.settings.apiKey) {
      toast('Add your Bifrost API key first (⚙️ Settings)');
      return;
    }
    if (state.pending.length === 0) {
      toast('Nothing pending to process');
      return;
    }
    const btn = document.getElementById('btn-process-pending');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
    const queue = state.pending.slice();
    state.pending = [];
    save();
    let done = 0, total = queue.length;
    for (const chunk of queue) {
      if (btn) btn.textContent = `Processing ${++done}/${total}…`;
      await extractAndStore(chunk.ts, chunk.text);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Process pending transcripts'; }
    toast(`Processed ${total} pending chunk${total === 1 ? '' : 's'}`);
    updateKeyMissingBanner();
  }

  // ----------- Speech recognition — dual mode (Whisper via Bifrost, or browser Web Speech) ------------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listening = false;
  let manualStop = false;
  let activeMode = null;  // 'whisper' | 'browser'

  // --- Whisper mode: MediaRecorder + Voice Activity Detection ---
  const VAD_PROFILES = {
    low:    { threshold: 0.010, minSpeechMs: 220, minSilenceMs: 1500 },  // more sensitive; picks up quieter speech
    medium: { threshold: 0.018, minSpeechMs: 260, minSilenceMs: 1200 },  // default
    high:   { threshold: 0.030, minSpeechMs: 300, minSilenceMs: 900  },  // less sensitive; noisier shops
  };
  const VAD_MAX_SEGMENT_MS = 25000;   // hard cap on any single recording segment
  const VAD_POLL_MS        = 60;      // how often to sample the mic level
  let audioStream = null;
  let audioCtx = null;
  let analyser = null;
  let vadTimer = null;
  let segRecorder = null;
  let segChunks = [];
  let segStartTs = 0;
  let inSpeech = false;
  let speechAboveSince = 0;
  let silenceSince = 0;
  let currentMime = '';
  let whisperInFlight = 0;

  function pickAudioMime() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
  }
  function extForMime(mime) {
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('mp4')) return 'm4a';
    if (mime.includes('ogg')) return 'ogg';
    return 'bin';
  }
  function whisperLang(langTag) {
    // Map BCP-47 (e.g. hi-IN) → ISO-639-1 for Whisper
    return (langTag || 'hi-IN').split('-')[0].toLowerCase();
  }

  async function startWhisperMode() {
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('MediaRecorder / getUserMedia not supported');
    }
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    currentMime = pickAudioMime();
    if (!currentMime) throw new Error('No supported audio codec for MediaRecorder');
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(audioStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    inSpeech = false;
    speechAboveSince = 0;
    silenceSince = 0;
    tickVAD();
  }

  function tickVAD() {
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    updateLevelMeter(rms);

    const cfg = VAD_PROFILES[state.settings.vadSensitivity] || VAD_PROFILES.medium;
    const now = performance.now();

    if (rms > cfg.threshold) {
      silenceSince = 0;
      if (!inSpeech) {
        if (!speechAboveSince) speechAboveSince = now;
        else if (now - speechAboveSince >= cfg.minSpeechMs) {
          startSegment();
          inSpeech = true;
        }
      }
    } else {
      speechAboveSince = 0;
      if (inSpeech) {
        if (!silenceSince) silenceSince = now;
        else if (now - silenceSince >= cfg.minSilenceMs) {
          endSegment();
          inSpeech = false;
          silenceSince = 0;
        }
      }
    }

    // Cap a single continuous segment
    if (inSpeech && segStartTs && (Date.now() - segStartTs) > VAD_MAX_SEGMENT_MS) {
      endSegment();
      startSegment();
    }

    vadTimer = setTimeout(tickVAD, VAD_POLL_MS);
  }

  function startSegment() {
    if (!audioStream) return;
    try {
      segChunks = [];
      segStartTs = Date.now();
      segRecorder = new MediaRecorder(audioStream, { mimeType: currentMime });
      segRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) segChunks.push(e.data); };
      segRecorder.onstop = () => {
        const blob = new Blob(segChunks, { type: currentMime });
        segChunks = [];
        if (blob.size > 1500) {
          transcribeBlob(blob).catch(err => console.error('transcribe failed', err));
        }
      };
      segRecorder.start();
      setRecordingIndicator(true);
    } catch (e) {
      console.error('startSegment failed', e);
    }
  }

  function endSegment() {
    try {
      if (segRecorder && segRecorder.state === 'recording') segRecorder.stop();
    } catch (e) { console.warn(e); }
    segRecorder = null;
    setRecordingIndicator(false);
  }

  async function transcribeBlob(blob) {
    const key = state.settings.apiKey?.trim();
    if (!key) {
      toast('Add your Bifrost API key first (⚙️ Settings)');
      return;
    }
    whisperInFlight++;
    setTranscribingIndicator(true);
    try {
      const form = new FormData();
      form.append('file', blob, `audio.${extForMime(currentMime)}`);
      form.append('model', state.settings.whisperModel || 'whisper-1');
      form.append('language', whisperLang(state.settings.lang));
      form.append('response_format', 'json');
      const res = await fetch(TRANSCRIBE_ENDPOINT, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Whisper ${res.status} ${txt.slice(0, 160)}`);
      }
      const data = await res.json();
      const text = (data && data.text) ? data.text.trim() : '';
      if (text && text.length > 1) {
        addUtterance(text);
      }
    } catch (e) {
      console.error('transcribeBlob error', e);
      toast('Transcription failed: ' + e.message.slice(0, 80));
    } finally {
      whisperInFlight--;
      if (whisperInFlight <= 0) setTranscribingIndicator(false);
    }
  }

  function stopWhisperMode() {
    if (vadTimer) { clearTimeout(vadTimer); vadTimer = null; }
    endSegment();
    if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    analyser = null;
    updateLevelMeter(0);
    setRecordingIndicator(false);
    setTranscribingIndicator(false);
  }

  // --- Browser (Web Speech API) mode — kept as a fallback ---
  let recognition = null;

  function initRecognition() {
    if (!SR) return null;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = state.settings.lang || 'hi-IN';
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0].transcript;
        if (res.isFinal) addUtterance(t);
        else interim += t;
      }
      const el = document.getElementById('interim');
      if (el) el.textContent = interim ? '… ' + interim : '';
    };
    r.onend = () => {
      const el = document.getElementById('interim');
      if (el) el.textContent = '';
      if (listening && !manualStop && state.settings.autoRestart) {
        setTimeout(() => { try { recognition && recognition.start(); } catch {} }, 250);
      } else {
        listening = false; manualStop = false; updateListenUI();
      }
    };
    r.onerror = e => {
      console.warn('recognition error', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast('Microphone permission blocked.'); stopListening();
      } else if (e.error === 'audio-capture') {
        toast('No microphone detected.'); stopListening();
      }
    };
    return r;
  }

  function startBrowserMode() {
    if (!SR) throw new Error('Web Speech API not supported');
    if (!recognition) recognition = initRecognition();
    recognition.lang = state.settings.lang;
    recognition.start();
  }

  function stopBrowserMode() {
    try { recognition && recognition.stop(); } catch {}
  }

  // --- Public listening controls (router) ---
  async function startListening() {
    if (listening) return;
    const mode = state.settings.asrMode === 'browser' ? 'browser' : 'whisper';
    manualStop = false;
    try {
      if (mode === 'whisper') {
        await startWhisperMode();
        activeMode = 'whisper';
      } else {
        startBrowserMode();
        activeMode = 'browser';
      }
      listening = true;
      updateListenUI();
    } catch (e) {
      console.error('startListening error', e);
      toast('Could not start ' + mode + ' mode: ' + e.message);
      // Auto-fallback: Whisper → Browser
      if (mode === 'whisper' && SR) {
        try {
          startBrowserMode();
          activeMode = 'browser';
          listening = true;
          toast('Fell back to browser speech recognition');
          updateListenUI();
        } catch {}
      }
    }
  }

  function stopListening() {
    manualStop = true;
    listening = false;
    if (activeMode === 'whisper') stopWhisperMode();
    else if (activeMode === 'browser') stopBrowserMode();
    activeMode = null;
    if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
    flushChunk();
    updateListenUI();
  }

  function updateListenUI() {
    const btn = document.getElementById('btn-listen');
    const label = document.getElementById('listen-label');
    const status = document.getElementById('listen-status');
    if (!btn) return;
    if (listening) {
      btn.classList.add('listening');
      btn.setAttribute('aria-pressed', 'true');
      label.textContent = 'Stop';
      const modeLabel = activeMode === 'whisper' ? 'Whisper (voice-triggered)' : 'browser speech';
      status.textContent = `🔴 Listening · ${modeLabel} · ${state.settings.lang}`;
    } else {
      btn.classList.remove('listening');
      btn.setAttribute('aria-pressed', 'false');
      label.textContent = 'Start Listening';
      status.textContent = 'Tap the mic to begin. Recording only triggers when speech is detected.';
    }
  }

  function updateLevelMeter(rms) {
    const el = document.getElementById('level-bar');
    if (!el) return;
    // Map RMS 0..0.2 → 0..100%
    const pct = Math.min(100, Math.round((rms / 0.2) * 100));
    el.style.width = pct + '%';
    const cfg = VAD_PROFILES[state.settings.vadSensitivity] || VAD_PROFILES.medium;
    el.dataset.speaking = rms > cfg.threshold ? '1' : '0';
  }

  function setRecordingIndicator(on) {
    const el = document.getElementById('rec-indicator');
    if (el) el.classList.toggle('active', !!on);
  }

  function setTranscribingIndicator(on) {
    const el = document.getElementById('rec-transcribing');
    if (el) el.classList.toggle('active', !!on);
  }

  // ----------- UI: Tabs ------------
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'summary') renderSummary();
    if (name === 'log') renderLog();
  }

  // ----------- Rendering ------------
  const $ = sel => document.querySelector(sel);
  const outcomeBadge = o => {
    const map = {
      sold: { cls: 'sold', label: 'Sold' },
      lost_expensive_here: { cls: 'lost', label: 'Lost · Expensive here' },
      lost_cheaper_elsewhere: { cls: 'lost', label: 'Lost · Cheaper elsewhere' },
      lost_other: { cls: 'lost', label: 'Lost · Other' },
      oos: { cls: 'oos', label: 'Out of stock' },
      unclear: { cls: 'unclear', label: 'Unclear' },
    };
    const m = map[o] || map.unclear;
    return `<span class="badge ${m.cls}">${m.label}</span>`;
  };
  const outcomeLabel = o => ({
    sold: 'Sold', lost_expensive_here: 'Lost — my price too high',
    lost_cheaper_elsewhere: 'Lost — cheaper elsewhere', lost_other: 'Lost — other reason',
    oos: 'Out of stock', unclear: 'Unclear'
  }[o] || o);

  function renderTranscript() {
    const el = document.getElementById('transcript');
    const today = todayStr();
    const items = state.transcript.filter(u => dayOf(u.ts) === today).slice(-40);
    if (items.length === 0) {
      el.innerHTML = '<p class="muted">Waiting for speech… Say something like <em>"Bhaiya, sugar hai kya?"</em> or <em>"क्या दूध है?"</em></p>';
      return;
    }
    el.innerHTML = items.map(u => `<div class="tt-item"><span class="tt-time">${timeFmt(u.ts)}</span>${escapeHtml(u.text)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  function todaysInteractions() {
    const today = todayStr();
    return state.interactions.filter(i => dayOf(i.ts) === today);
  }

  function renderLiveInteractions() {
    const el = document.getElementById('live-interactions');
    const items = todaysInteractions().slice(-20).reverse();
    if (items.length === 0) {
      el.innerHTML = '<p class="muted">Interactions will appear here as customers speak.</p>';
      return;
    }
    el.innerHTML = items.map(i => `
      <div class="interaction" data-id="${i.id}">
        <div>
          <div class="prod">${escapeHtml(i.product)}</div>
          <div class="snip">${escapeHtml(i.snippet || '')}</div>
          <div class="meta">${timeFmt(i.ts)}${i.price ? ' · ₹' + i.price : ''}${i.reason ? ' · ' + escapeHtml(i.reason) : ''}</div>
        </div>
        ${outcomeBadge(i.outcome)}
      </div>`).join('');
    el.querySelectorAll('.interaction').forEach(el => el.addEventListener('click', () => openEdit(el.dataset.id)));
  }

  function renderQuickStats() {
    const items = todaysInteractions();
    document.getElementById('qs-total').textContent = items.length;
    document.getElementById('qs-reorder').textContent = items.filter(i => i.outcome === 'oos').length;
    document.getElementById('qs-lost').textContent = items.filter(i => i.outcome.startsWith('lost_')).length;
    const rev = items.filter(i => i.outcome === 'sold').reduce((s, i) => s + (Number(i.price) || 0), 0);
    document.getElementById('qs-revenue').textContent = '₹' + rev.toLocaleString('en-IN');
  }

  function renderSummary() {
    const dateEl = document.getElementById('summary-date');
    if (!dateEl.value) dateEl.value = todayStr();
    const chosen = dateEl.value;
    const items = state.interactions.filter(i => dayOf(i.ts) === chosen);

    const sold = items.filter(i => i.outcome === 'sold');
    const lost = items.filter(i => i.outcome.startsWith('lost_'));
    const oos = items.filter(i => i.outcome === 'oos');
    const revenue = sold.reduce((s, i) => s + (Number(i.price) || 0), 0);

    $('#sm-total').textContent = items.length;
    $('#sm-sold').textContent = sold.length;
    $('#sm-revenue').textContent = '₹' + revenue.toLocaleString('en-IN');
    $('#sm-lost').textContent = lost.length;
    $('#sm-oos').textContent = oos.length;

    // Reorder list
    const reorderCounts = {};
    oos.forEach(i => reorderCounts[i.product] = (reorderCounts[i.product] || 0) + 1);
    const reorderEntries = Object.entries(reorderCounts).sort((a, b) => b[1] - a[1]);
    $('#reorder-count').textContent = reorderEntries.length;
    $('#reorder-list').innerHTML = reorderEntries.length === 0
      ? '<p class="muted">🎉 You had everything customers asked for.</p>'
      : reorderEntries.map(([p, c]) => `<div class="reorder-item"><span>${escapeHtml(p)}</span><span class="count">${c}× asked</span></div>`).join('');

    // Lost breakdown
    const breakdown = {
      lost_expensive_here: lost.filter(i => i.outcome === 'lost_expensive_here').length,
      lost_cheaper_elsewhere: lost.filter(i => i.outcome === 'lost_cheaper_elsewhere').length,
      lost_other: lost.filter(i => i.outcome === 'lost_other').length,
    };
    $('#lost-breakdown').innerHTML = `
      <div class="lost-chip"><span class="chip-num">${breakdown.lost_expensive_here}</span><span class="chip-label">💰 My price too high</span></div>
      <div class="lost-chip"><span class="chip-num">${breakdown.lost_cheaper_elsewhere}</span><span class="chip-label">🏪 Cheaper elsewhere</span></div>
      <div class="lost-chip"><span class="chip-num">${breakdown.lost_other}</span><span class="chip-label">🤷 Other reason</span></div>
    `;

    $('#lost-list').innerHTML = lost.length === 0
      ? '<p class="muted">No lost sales on this day.</p>'
      : lost.map(i => `
        <div class="lost-item">
          <div>
            <div><strong>${escapeHtml(i.product)}</strong></div>
            <div class="reason">${escapeHtml(i.reason || outcomeLabel(i.outcome))} · ${timeFmt(i.ts)}${i.price ? ' · ₹' + i.price : ''}</div>
          </div>
          ${outcomeBadge(i.outcome)}
        </div>`).join('');

    $('#sold-list').innerHTML = sold.length === 0
      ? '<p class="muted">No sales recorded on this day.</p>'
      : sold.map(i => `
        <div class="sold-item">
          <div><strong>${escapeHtml(i.product)}</strong> <span class="reason">· ${timeFmt(i.ts)}</span></div>
          <div>₹${i.price || '?'}</div>
        </div>`).join('');
  }

  function renderLog() {
    const dateFilter = $('#log-filter-date').value || todayStr();
    if (!$('#log-filter-date').value) $('#log-filter-date').value = dateFilter;
    const outcomeFilter = $('#log-filter-outcome').value;
    let items = state.interactions.filter(i => dayOf(i.ts) === dateFilter);
    if (outcomeFilter !== 'all') {
      items = items.filter(i => {
        if (outcomeFilter === 'lost') return i.outcome.startsWith('lost_');
        return i.outcome === outcomeFilter;
      });
    }
    items = items.sort((a, b) => b.ts.localeCompare(a.ts));
    const list = $('#log-list');
    if (items.length === 0) {
      list.innerHTML = '<p class="muted">No interactions for this day / filter.</p>';
      return;
    }
    list.innerHTML = items.map(i => `
      <div class="log-item" data-id="${i.id}">
        <div>
          <strong>${escapeHtml(i.product)}</strong>${i.price ? ' · ₹' + i.price : ''}
          <div class="li-snippet">${escapeHtml(i.snippet || '')}</div>
        </div>
        ${outcomeBadge(i.outcome)}
        <div class="li-time">${timeFmt(i.ts)}</div>
      </div>`).join('');
    list.querySelectorAll('.log-item').forEach(el => el.addEventListener('click', () => openEdit(el.dataset.id)));
  }

  function renderAll() {
    renderQuickStats();
    renderLiveInteractions();
    renderTranscript();
    // Only redraw summary/log if visible
    if (document.querySelector('.tab.active').dataset.tab === 'summary') renderSummary();
    if (document.querySelector('.tab.active').dataset.tab === 'log') renderLog();
  }

  // ----------- Modals ------------
  function openManual() {
    $('#m-product').value = '';
    $('#m-outcome').value = 'sold';
    $('#m-price').value = '';
    $('#m-notes').value = '';
    $('#modal-manual').hidden = false;
    $('#m-product').focus();
  }
  function closeManual() { $('#modal-manual').hidden = true; }
  function saveManual() {
    const product = $('#m-product').value.trim();
    if (!product) { toast('Please enter a product'); return; }
    const outcome = $('#m-outcome').value;
    const price = $('#m-price').value ? Number($('#m-price').value) : null;
    const notes = $('#m-notes').value.trim();
    state.interactions.push({
      id: uid(), ts: nowISO(), product, outcome, price,
      reason: outcome.startsWith('lost_') ? outcomeLabel(outcome).replace('Lost — ', '') : null,
      snippet: '', notes, source: 'manual',
    });
    save();
    closeManual();
    toast('Interaction saved');
    renderAll();
  }

  let editingId = null;
  function openEdit(id) {
    const i = state.interactions.find(x => x.id === id);
    if (!i) return;
    editingId = id;
    $('#e-product').value = i.product;
    $('#e-outcome').value = i.outcome;
    $('#e-price').value = i.price ?? '';
    $('#e-notes').value = i.notes || '';
    $('#e-snippet').value = i.snippet || '';
    $('#modal-edit').hidden = false;
  }
  function closeEdit() { $('#modal-edit').hidden = true; editingId = null; }
  function saveEdit() {
    const i = state.interactions.find(x => x.id === editingId);
    if (!i) return;
    i.product = $('#e-product').value.trim() || i.product;
    i.outcome = $('#e-outcome').value;
    i.price = $('#e-price').value ? Number($('#e-price').value) : null;
    i.notes = $('#e-notes').value.trim();
    save();
    closeEdit();
    renderAll();
    toast('Updated');
  }
  function deleteEdit() {
    if (!editingId) return;
    if (!confirm('Delete this interaction?')) return;
    state.interactions = state.interactions.filter(x => x.id !== editingId);
    save();
    closeEdit();
    renderAll();
    toast('Deleted');
  }

  async function rerunEdit() {
    const i = state.interactions.find(x => x.id === editingId);
    if (!i) return;
    const snippet = $('#e-snippet').value.trim() || i.snippet || i.product;
    if (!snippet) { toast('No snippet to re-run — edit the transcript field first'); return; }
    if (!state.settings.apiKey) { toast('Add your Bifrost API key first (⚙️ Settings)'); return; }
    const btn = $('#e-rerun');
    btn.disabled = true; btn.textContent = 'Re-running…';
    try {
      const items = await aiExtract(snippet);
      if (items.length === 0) {
        toast('AI returned no interaction — leaving record as-is');
      } else {
        // Pick the interaction whose product best matches (or the first one)
        const match = items.find(x => (x.product || '').toLowerCase() === (i.product || '').toLowerCase()) || items[0];
        i.product = match.product || i.product;
        i.outcome = match.outcome || i.outcome;
        i.price = (match.price ?? i.price ?? null);
        i.reason = match.reason || i.reason || null;
        i.snippet = match.snippet || snippet;
        i.source = 'ai';
        save();
        // Refresh modal fields
        $('#e-product').value = i.product;
        $('#e-outcome').value = i.outcome;
        $('#e-price').value = i.price ?? '';
        $('#e-notes').value = i.notes || '';
        $('#e-snippet').value = i.snippet || '';
        renderAll();
        toast(`Re-classified as: ${outcomeLabel(i.outcome)}`);
      }
    } catch (e) {
      toast('AI failed: ' + e.message.slice(0, 80));
    } finally {
      btn.disabled = false; btn.textContent = '🔄 Re-run AI';
    }
  }

  // ----------- Export / Import ------------
  function download(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function toCSV(items) {
    const cols = ['ts', 'date', 'time', 'product', 'outcome', 'price', 'reason', 'notes', 'snippet', 'source'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = items.map(i => [
      i.ts, dayOf(i.ts), timeFmt(i.ts), i.product, i.outcome, i.price ?? '',
      i.reason || '', i.notes || '', i.snippet || '', i.source || ''
    ].map(esc).join(','));
    return cols.join(',') + '\n' + rows.join('\n');
  }

  function exportCSV() {
    const chosen = $('#summary-date').value || todayStr();
    const items = state.interactions.filter(i => dayOf(i.ts) === chosen);
    download(`sunodukaan-${chosen}.csv`, toCSV(items), 'text/csv');
  }
  function exportJSONDay() {
    const chosen = $('#summary-date').value || todayStr();
    const items = state.interactions.filter(i => dayOf(i.ts) === chosen);
    download(`sunodukaan-${chosen}.json`, JSON.stringify(items, null, 2), 'application/json');
  }
  function exportAll() {
    download(`sunodukaan-all-${todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json');
  }
  function importFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.interactions && Array.isArray(parsed.interactions)) {
          state = { ...state, ...parsed, settings: { ...state.settings, ...(parsed.settings || {}) } };
        } else if (Array.isArray(parsed)) {
          state.interactions = state.interactions.concat(parsed);
        } else { throw new Error('Unknown format'); }
        save();
        renderAll();
        toast('Import successful');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ----------- Settings binding ------------
  function bindSettings() {
    const l = $('#setting-lang'); l.value = state.settings.lang;
    l.addEventListener('change', () => {
      state.settings.lang = l.value;
      if (recognition) recognition.lang = l.value;
      save();
      toast('Language updated');
    });
    const ar = $('#setting-auto-restart'); ar.checked = state.settings.autoRestart;
    ar.addEventListener('change', () => { state.settings.autoRestart = ar.checked; save(); });

    const asr = $('#setting-asr-mode');
    if (asr) {
      asr.value = state.settings.asrMode || 'whisper';
      asr.addEventListener('change', () => {
        state.settings.asrMode = asr.value;
        save();
        toast(`Speech engine: ${asr.value === 'whisper' ? 'Whisper' : 'Browser'} — will take effect on next Start`);
      });
    }
    const vad = $('#setting-vad');
    if (vad) {
      vad.value = state.settings.vadSensitivity || 'medium';
      vad.addEventListener('change', () => {
        state.settings.vadSensitivity = vad.value;
        save();
      });
    }

    const k = $('#setting-api-key'); k.value = state.settings.apiKey || '';
    k.addEventListener('change', () => {
      const wasEmpty = !state.settings.apiKey;
      state.settings.apiKey = k.value.trim();
      save();
      updateKeyMissingBanner();
      if (wasEmpty && state.settings.apiKey && state.pending.length > 0) {
        toast(`Key saved · ${state.pending.length} pending chunk(s) waiting`);
      }
    });

    const m = $('#setting-model');
    if (m) {
      m.value = state.settings.model || 'gpt-5.5';
      m.addEventListener('change', () => {
        state.settings.model = m.value;
        save();
        toast(`Model set to ${m.value}`);
      });
    }

    $('#btn-test-ai').addEventListener('click', async () => {
      const out = $('#ai-test-result'); out.textContent = 'Testing…';
      try {
        const items = await aiExtract('bhaiya sugar hai kya? haan hai, 45 rupaye kilo. mahenga hai chodo.');
        out.textContent = `✅ Works · got ${items.length} interaction(s)`;
      } catch (e) { out.textContent = '❌ ' + e.message; }
    });

    $('#btn-export-all').addEventListener('click', exportAll);
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); });
    $('#btn-wipe').addEventListener('click', () => {
      if (!confirm('Delete ALL data? This cannot be undone.')) return;
      state = structuredClone(DEFAULT_STATE);
      save();
      renderAll();
      bindSettings();
      toast('All data cleared');
    });
  }

  // ----------- Utility ------------
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function updateKeyMissingBanner() {
    const banner = document.getElementById('key-banner');
    const pendingCount = state.pending.length;
    const hasKey = !!state.settings.apiKey;
    const btn = document.getElementById('btn-process-pending');
    if (!hasKey) {
      banner.hidden = false;
      banner.innerHTML = `
        <div>
          <strong>⚠️ AI extraction is disabled — add your Bifrost API key to start turning conversations into insights.</strong>
          ${pendingCount > 0 ? `<div class="banner-sub">${pendingCount} conversation chunk${pendingCount === 1 ? '' : 's'} captured and waiting to be processed.</div>` : ''}
        </div>
        <button class="btn-primary" id="banner-goto-settings">Open Settings</button>`;
      document.getElementById('banner-goto-settings').addEventListener('click', () => switchTab('settings'));
      if (btn) btn.hidden = pendingCount === 0;
    } else if (pendingCount > 0) {
      banner.hidden = false;
      banner.innerHTML = `
        <div>
          <strong>${pendingCount} chunk${pendingCount === 1 ? '' : 's'} queued for AI processing.</strong>
          <div class="banner-sub">These are conversations that couldn't be processed (usually because the API was down or the key was missing).</div>
        </div>
        <button class="btn-primary" id="banner-process">Process now</button>`;
      document.getElementById('banner-process').addEventListener('click', processPending);
      if (btn) btn.hidden = false;
    } else {
      banner.hidden = true;
      if (btn) btn.hidden = true;
    }
  }

  function showKeyMissingBanner() { updateKeyMissingBanner(); }

  // ----------- Boot ------------
  function boot() {
    // Tabs
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    // Listen button
    document.getElementById('btn-listen').addEventListener('click', () => listening ? stopListening() : startListening());
    document.getElementById('btn-clear-transcript').addEventListener('click', () => {
      const today = todayStr();
      state.transcript = state.transcript.filter(u => dayOf(u.ts) !== today);
      save(); renderTranscript();
    });

    // Manual add
    document.getElementById('btn-add-manual').addEventListener('click', openManual);
    document.getElementById('m-save').addEventListener('click', saveManual);
    document.getElementById('m-cancel').addEventListener('click', closeManual);

    // Edit
    document.getElementById('e-save').addEventListener('click', saveEdit);
    document.getElementById('e-cancel').addEventListener('click', closeEdit);
    document.getElementById('e-delete').addEventListener('click', deleteEdit);
    document.getElementById('e-rerun').addEventListener('click', rerunEdit);

    // Summary
    document.getElementById('summary-date').value = todayStr();
    document.getElementById('summary-date').addEventListener('change', renderSummary);
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('btn-export-json').addEventListener('click', exportJSONDay);

    // Log
    document.getElementById('log-filter-date').value = todayStr();
    document.getElementById('log-filter-date').addEventListener('change', renderLog);
    document.getElementById('log-filter-outcome').addEventListener('change', renderLog);
    document.getElementById('btn-clear-day').addEventListener('click', () => {
      const day = $('#log-filter-date').value || todayStr();
      if (!confirm('Clear all interactions for ' + day + '?')) return;
      state.interactions = state.interactions.filter(i => dayOf(i.ts) !== day);
      save(); renderAll();
    });

    bindSettings();
    renderAll();
    updateKeyMissingBanner();

    const bp = document.getElementById('btn-process-pending');
    if (bp) bp.addEventListener('click', processPending);

    if (!SR) {
      document.getElementById('listen-status').innerHTML = '⚠️ Speech recognition not supported in this browser. Please open in <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Safari</strong>. On mobile, Chrome for Android works best.';
      document.getElementById('btn-listen').disabled = true;
      document.getElementById('btn-listen').style.opacity = 0.5;
    }

    // Warn on close if listening
    window.addEventListener('beforeunload', () => { if (listening) return true; });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

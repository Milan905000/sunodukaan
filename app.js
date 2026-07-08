/* Sunodukaan — always-on shop voice analytics */
(() => {
  'use strict';

  // ----------- Storage ------------
  const KEY = 'sunodukaan.v1';
  const DEFAULT_STATE = {
    settings: {
      lang: 'hi-IN',
      autoRestart: true,
      aiEnabled: false,
      apiKey: '',
    },
    interactions: [],   // {id, ts, product, outcome, price, reason, snippet, notes, source}
    transcript: [],     // {id, ts, text}
  };
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      // shallow merge to catch new default keys after upgrades
      return {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      };
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

  // ----------- Product database (Hindi / Hinglish / English) ------------
  // Each entry: {en: english name, keys: [regex or lowercase words that indicate this product]}
  const PRODUCTS = [
    { en: 'Sugar',       keys: ['sugar', 'chini', 'cheeni', 'chinee', 'shakar', 'shakkar', 'चीनी', 'शक्कर'] },
    { en: 'Salt',        keys: ['salt', 'namak', 'नमक', 'tata salt'] },
    { en: 'Rice',        keys: ['rice', 'chawal', 'chaval', 'चावल', 'basmati'] },
    { en: 'Wheat Flour', keys: ['atta', 'aata', 'flour', 'gehu', 'gehun', 'आटा', 'गेहूँ', 'ashirwad', 'ashirvad', 'aashirvaad'] },
    { en: 'Maida',       keys: ['maida', 'मैदा'] },
    { en: 'Besan',       keys: ['besan', 'बेसन', 'gram flour'] },
    { en: 'Sooji',       keys: ['sooji', 'suji', 'rava', 'सूजी', 'रवा'] },
    { en: 'Dal / Lentils', keys: ['dal', 'daal', 'lentil', 'moong', 'toor', 'tur', 'arhar', 'urad', 'chana', 'masoor', 'दाल', 'मूंग', 'तूर', 'अरहर', 'उड़द', 'चना', 'मसूर'] },
    { en: 'Cooking Oil', keys: ['oil', 'tel', 'sarso', 'sarson', 'mustard oil', 'refined', 'sunflower', 'तेल', 'सरसों', 'fortune', 'saffola', 'dhara'] },
    { en: 'Ghee',        keys: ['ghee', 'देसी घी', 'घी', 'amul ghee'] },
    { en: 'Tea',         keys: ['tea', 'chai', 'चाय', 'tata tea', 'brooke bond', 'red label', 'taj mahal', 'lipton'] },
    { en: 'Coffee',      keys: ['coffee', 'kaafi', 'nescafe', 'bru', 'कॉफी'] },
    { en: 'Milk',        keys: ['milk', 'doodh', 'dudh', 'दूध', 'amul milk', 'mother dairy'] },
    { en: 'Curd / Dahi', keys: ['curd', 'dahi', 'yogurt', 'दही'] },
    { en: 'Paneer',      keys: ['paneer', 'पनीर', 'cottage cheese'] },
    { en: 'Butter',      keys: ['butter', 'makhan', 'मक्खन', 'amul butter'] },
    { en: 'Cheese',      keys: ['cheese', 'चीज़', 'amul cheese', 'britannia cheese'] },
    { en: 'Bread',       keys: ['bread', 'ब्रेड', 'pav', 'पाव', 'britannia bread'] },
    { en: 'Eggs',        keys: ['egg', 'eggs', 'anda', 'ande', 'अंडा', 'अंडे'] },

    { en: 'Biscuits',    keys: ['biscuit', 'biscuits', 'बिस्किट', 'parle g', 'parle-g', 'marie', 'good day', 'bourbon', 'hide and seek', 'oreo', 'britannia', 'monaco', 'krackjack'] },
    { en: 'Chips',       keys: ['chips', 'चिप्स', 'lays', 'kurkure', 'balaji', 'uncle chipps', 'wafer', 'wafers'] },
    { en: 'Namkeen',     keys: ['namkeen', 'नमकीन', 'haldiram', 'bhujia', 'भुजिया', 'sev', 'chivda'] },
    { en: 'Chocolate',   keys: ['chocolate', 'चॉकलेट', 'dairy milk', 'kitkat', 'perk', 'munch', 'five star', '5star', 'gems'] },
    { en: 'Maggi',       keys: ['maggi', 'मैगी', 'noodles', 'yipee', 'top ramen'] },

    { en: 'Coca-Cola',   keys: ['coke', 'coca cola', 'coca-cola', 'कोक'] },
    { en: 'Pepsi',       keys: ['pepsi', 'पेप्सी'] },
    { en: 'Thums Up',    keys: ['thums up', 'thumbs up', 'थम्स अप'] },
    { en: 'Limca',       keys: ['limca', 'लिम्का'] },
    { en: 'Sprite',      keys: ['sprite', 'स्प्राइट'] },
    { en: 'Frooti / Maaza', keys: ['frooti', 'फ्रूटी', 'maaza', 'maza', 'मज़ा', 'slice', 'appy'] },
    { en: 'Water Bottle',keys: ['water', 'paani', 'पानी', 'bisleri', 'bislery', 'kinley', 'aquafina', 'bottle', 'बोतल'] },
    { en: 'Juice',       keys: ['juice', 'jusi', 'रस', 'real', 'tropicana', 'paperboat', 'paper boat'] },
    { en: 'Milk Powder / Bournvita', keys: ['bournvita', 'bourn vita', 'boost', 'horlicks', 'complan'] },

    { en: 'Soap',        keys: ['soap', 'saabun', 'sabun', 'साबुन', 'lifebuoy', 'dettol', 'lux', 'santoor', 'cinthol', 'medimix', 'godrej no 1', 'pears', 'dove'] },
    { en: 'Shampoo',     keys: ['shampoo', 'शैंपू', 'clinic plus', 'clinic+', 'sunsilk', 'head and shoulders', 'pantene', 'dove shampoo', 'chik'] },
    { en: 'Toothpaste',  keys: ['toothpaste', 'manjan', 'दंत मंजन', 'colgate', 'pepsodent', 'closeup', 'close up', 'sensodyne', 'dabur red', 'patanjali dant'] },
    { en: 'Toothbrush',  keys: ['toothbrush', 'brush', 'ब्रश', 'colgate brush', 'oral b'] },
    { en: 'Hair Oil',    keys: ['hair oil', 'parachute', 'dabur amla', 'navratna', 'kesh', 'coconut oil'] },
    { en: 'Face Cream',  keys: ['cream', 'क्रीम', 'fair and lovely', 'glow and lovely', 'ponds', 'nivea', 'boroplus', 'boro plus', 'vaseline'] },
    { en: 'Talcum Powder', keys: ['powder', 'पाउडर', 'ponds powder', 'yardley', 'nycil'] },
    { en: 'Sanitary Pads', keys: ['pad', 'pads', 'sanitary', 'whisper', 'stayfree', 'sofy'] },
    { en: 'Diapers',     keys: ['diaper', 'pampers', 'huggies', 'mamypoko', 'mamy poko'] },

    { en: 'Detergent',   keys: ['detergent', 'washing powder', 'surf', 'ariel', 'tide', 'rin', 'wheel', 'nirma', 'ghadi', 'ezee'] },
    { en: 'Dishwash',    keys: ['dishwash', 'vim', 'pril', 'exo', 'dish', 'bartan', 'बर्तन'] },
    { en: 'Floor Cleaner', keys: ['harpic', 'lizol', 'phenyl', 'floor cleaner', 'फिनाइल'] },
    { en: 'Agarbatti',   keys: ['agarbatti', 'incense', 'अगरबत्ती', 'cycle brand', 'zed black'] },
    { en: 'Matchbox',    keys: ['matchbox', 'match', 'माचिस', 'machis'] },
    { en: 'Candle',      keys: ['candle', 'मोमबत्ती', 'mombatti'] },
    { en: 'Battery',     keys: ['battery', 'cell', 'सेल', 'eveready', 'duracell'] },
    { en: 'Mosquito Repellent', keys: ['mortein', 'all out', 'good knight', 'goodknight', 'hit', 'mosquito', 'मच्छर'] },

    { en: 'Cigarette',   keys: ['cigarette', 'sigret', 'सिगरेट', 'gold flake', 'wills', 'classic', 'marlboro', 'goldflake'] },
    { en: 'Bidi',        keys: ['bidi', 'beedi', 'बीड़ी'] },
    { en: 'Pan Masala',  keys: ['pan masala', 'paan masala', 'rajnigandha', 'vimal', 'tulsi', 'kamla pasand'] },
    { en: 'Gutkha',      keys: ['gutkha', 'gutka', 'गुटखा'] },

    { en: 'Onion',       keys: ['onion', 'pyaz', 'pyaaz', 'प्याज'] },
    { en: 'Potato',      keys: ['potato', 'aloo', 'आलू'] },
    { en: 'Tomato',      keys: ['tomato', 'tamatar', 'टमाटर'] },
    { en: 'Ginger',      keys: ['ginger', 'adrak', 'अदरक'] },
    { en: 'Garlic',      keys: ['garlic', 'lehsun', 'lasun', 'लहसुन'] },
    { en: 'Green Chilli',keys: ['chilli', 'chilly', 'mirchi', 'हरी मिर्च'] },
    { en: 'Lemon',       keys: ['lemon', 'nimbu', 'नींबू'] },
    { en: 'Coriander',   keys: ['coriander', 'dhaniya', 'धनिया'] },
    { en: 'Curry Leaf',  keys: ['curry leaf', 'kadi patta', 'karipatta', 'करी पत्ता'] },
  ];

  // Precompile lowercase words + Devanagari alt for quick lookup
  const PRODUCT_INDEX = PRODUCTS.map(p => ({ en: p.en, keys: p.keys.map(k => k.toLowerCase()) }));

  // ----------- Extraction rules ------------
  const AVAIL_YES = ['है', 'हैं', 'मिल जाएगा', 'मिल जायेगा', 'available', 'haan hai', 'ha hai', 'yes hai', 'ji hai', 'yes', 'haan', 'ji', 'ha ha', 'stock hai', 'hai bhaiya', 'le lo', 'रखा है'];
  const AVAIL_NO  = ['नहीं है', 'nahi hai', 'nahi hain', 'नही है', 'khatam', 'खतम', 'out of stock', 'stock nahi', 'stock khatam', 'not available', 'kal aayega', 'kal aaega', 'kal milega', 'kal aa jayega', 'abhi nahi', 'abhi khatam', 'finish', 'khatm ho gaya', 'नहीं मिलेगा'];
  const REJ_EXPENSIVE_HERE = ['mahenga', 'mehnga', 'mahnga', 'mahanga', 'महँगा', 'महंगा', 'expensive', 'costly', 'bahot mahenga', 'bahut mahenga', 'jyada hai', 'zyada hai', 'ज़्यादा है', 'ज्यादा है', 'kam kar do', 'discount', 'kam karo', 'kam kariye', 'reduce', 'high price', 'itna nahi'];
  const REJ_CHEAPER_ELSEWHERE = ['sasta milta', 'sasta mil raha', 'wahan sasta', 'usse sasta', 'aur sasta', 'सस्ता मिलता', 'सस्ता मिल', 'dukan pe sasta', 'dukaan pe sasta', 'anywhere else', 'cheaper elsewhere', 'aur jagah', 'dusri jagah', 'दूसरी जगह', 'other shop', 'kirana', 'wholesale', 'दुकान पर सस्ता'];
  const BUY_YES = ['de do', 'de dijiye', 'de dena', 'pack karo', 'pack kar do', 'दे दो', 'दे दीजिये', 'de do bhaiya', 'pack kar do', 'le lunga', 'lunga', 'लूँगा', 'ले लूँगा', 'ok de do', 'theek hai', 'thik hai', 'ठीक है', 'okay', 'chalo', 'चलो', 'pack it', 'ha de do'];
  const BUY_NO  = ['nahi lena', 'nahi chahiye', 'नहीं चाहिए', 'chodo', 'chhodo', 'छोडो', 'rehne do', 'rahne do', 'रहने दो', 'नहीं', 'nahi bhaiya', 'kal aaunga', 'kal ke liye', 'baad me', 'baad mein', 'बाद में', 'skip', 'not now'];
  const ASK_MARKERS = ['hai kya', 'है क्या', 'kya hai', 'क्या है', 'do you have', 'milega', 'मिलेगा', 'milegi', 'मिलेगी', 'chahiye', 'चाहिए', 'de do', 'de dena', 'दे दो', 'dena', 'kitna', 'कितना', 'kitne ka'];

  const PRICE_RE = /(?:₹|rs\.?|rupees?|rupaye|rupay|रुपये|रुपए|रुपैया|रु\.?)\s*(\d{1,5}(?:\.\d{1,2})?)|(\d{1,5})\s*(?:rs\.?|rupees?|rupaye|रुपये|रुपैया)/i;
  const PLAIN_PRICE_RE = /\b(\d{1,4})\s*(?:ka|ke|का|के)?\b/i;

  function detectProduct(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    let bestMatch = null;
    let bestLen = 0;
    for (const p of PRODUCT_INDEX) {
      for (const k of p.keys) {
        if (lower.includes(k) && k.length > bestLen) {
          bestMatch = p.en; bestLen = k.length;
        }
      }
    }
    return bestMatch;
  }

  function containsAny(text, arr) {
    const lower = text.toLowerCase();
    return arr.some(k => lower.includes(k.toLowerCase()));
  }

  function extractPrice(text) {
    const m = text.match(PRICE_RE);
    if (m) return Number(m[1] || m[2]);
    return null;
  }

  // Rule-based interaction extraction from a chunk of utterances
  function ruleExtract(chunk) {
    const joined = chunk.map(u => u.text).join(' ');
    const product = detectProduct(joined);
    if (!product) return null;

    let outcome = 'unclear';
    let reason = null;
    let price = extractPrice(joined);

    const availableSaid = containsAny(joined, AVAIL_NO) ? false : (containsAny(joined, AVAIL_YES) ? true : null);
    const bought = containsAny(joined, BUY_NO) ? false : (containsAny(joined, BUY_YES) ? true : null);
    const expensiveHere = containsAny(joined, REJ_EXPENSIVE_HERE);
    const cheaperElsewhere = containsAny(joined, REJ_CHEAPER_ELSEWHERE);

    if (availableSaid === false) {
      outcome = 'oos';
      reason = 'Not in stock';
    } else if (bought === true) {
      outcome = 'sold';
    } else if (cheaperElsewhere) {
      outcome = 'lost_cheaper_elsewhere';
      reason = 'Cheaper elsewhere';
    } else if (expensiveHere) {
      outcome = 'lost_expensive_here';
      reason = 'My price too high';
    } else if (bought === false) {
      outcome = 'lost_other';
      reason = 'Customer decided not to buy';
    } else {
      outcome = 'unclear';
    }

    return {
      product,
      outcome,
      price,
      reason,
      snippet: joined.trim().slice(0, 240),
    };
  }

  // ----------- AI (Anthropic) extraction ------------
  const AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';
  const AI_MODEL = 'claude-haiku-4-5-20251001';
  const AI_SYSTEM = `You extract retail-shop customer interactions from short conversation snippets (typically Hindi, English, or Hinglish, spoken between a shopkeeper and a customer). Return valid JSON only. No preamble.
Schema: {"interactions":[{"product":"<English name>","outcome":"sold|lost_expensive_here|lost_cheaper_elsewhere|lost_other|oos|unclear","price":<number or null>,"reason":"<short reason or null>","snippet":"<verbatim short snippet>"}]}
Outcome definitions:
- sold: customer decided to buy
- lost_expensive_here: customer said the shop's price is too high
- lost_cheaper_elsewhere: customer said they can get it cheaper elsewhere
- lost_other: customer decided not to buy for another reason (not needed now, will come later, etc.)
- oos: the shopkeeper said the item is not in stock / khatam / kal aayega — this means reorder
- unclear: mention of a product but no clear outcome
Only include interactions where a real product is mentioned. Ignore chitchat. If nothing found, return {"interactions":[]}.`;

  async function aiExtract(chunkText) {
    const key = state.settings.apiKey?.trim();
    if (!key) throw new Error('No API key set');
    const body = {
      model: AI_MODEL,
      max_tokens: 1024,
      system: AI_SYSTEM,
      messages: [{ role: 'user', content: `Conversation:\n"""\n${chunkText}\n"""\nExtract interactions as JSON.` }],
    };
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`AI request failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
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

    let items = [];
    if (state.settings.aiEnabled && state.settings.apiKey) {
      try {
        items = await aiExtract(joined);
      } catch (e) {
        console.error('AI extraction failed, falling back to rules', e);
        toast('AI extraction failed — using keyword mode');
        const r = ruleExtract(chunk);
        if (r) items = [r];
      }
    } else {
      const r = ruleExtract(chunk);
      if (r) items = [r];
    }

    for (const it of items) {
      if (!it || !it.product) continue;
      state.interactions.push({
        id: uid(),
        ts: chunk[0].ts,
        product: it.product,
        outcome: it.outcome || 'unclear',
        price: it.price ?? null,
        reason: it.reason || null,
        snippet: it.snippet || joined.slice(0, 240),
        notes: '',
        source: state.settings.aiEnabled ? 'ai' : 'rules',
      });
    }
    save();
    renderAll();
  }

  // ----------- Speech recognition ------------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let manualStop = false;

  function initRecognition() {
    if (!SR) return null;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = state.settings.lang || 'hi-IN';
    r.onresult = onResult;
    r.onend = onEnd;
    r.onerror = onError;
    return r;
  }

  function onResult(event) {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const t = res[0].transcript;
      if (res.isFinal) addUtterance(t);
      else interim += t;
    }
    document.getElementById('interim').textContent = interim ? '… ' + interim : '';
  }

  function onEnd() {
    document.getElementById('interim').textContent = '';
    if (listening && !manualStop && state.settings.autoRestart) {
      // Chrome/Edge stops after a bit of silence; restart
      setTimeout(() => {
        try { recognition && recognition.start(); }
        catch (e) { /* already running */ }
      }, 250);
    } else {
      listening = false;
      manualStop = false;
      updateListenUI();
    }
  }

  function onError(e) {
    console.warn('recognition error', e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      toast('Microphone permission blocked. Enable it in your browser.');
      stopListening();
    } else if (e.error === 'audio-capture') {
      toast('No microphone detected.');
      stopListening();
    } else if (e.error === 'no-speech') {
      // ignore, onEnd will restart
    } else if (e.error === 'network') {
      toast('Network error — speech service unreachable.');
    } else {
      // network or other — will restart via onEnd
    }
  }

  function startListening() {
    if (!SR) {
      toast('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari on desktop/Android.');
      return;
    }
    if (listening) return;
    if (!recognition) recognition = initRecognition();
    recognition.lang = state.settings.lang;
    try {
      recognition.start();
      listening = true;
      manualStop = false;
      updateListenUI();
    } catch (e) {
      console.warn(e);
    }
  }

  function stopListening() {
    manualStop = true;
    listening = false;
    try { recognition && recognition.stop(); } catch {}
    if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
    flushChunk();
    updateListenUI();
  }

  function updateListenUI() {
    const btn = document.getElementById('btn-listen');
    const label = document.getElementById('listen-label');
    const status = document.getElementById('listen-status');
    if (listening) {
      btn.classList.add('listening');
      btn.setAttribute('aria-pressed', 'true');
      label.textContent = 'Stop';
      status.textContent = `🔴 Listening (${state.settings.lang}) — always-on mode ${state.settings.autoRestart ? 'ON' : 'OFF'}`;
    } else {
      btn.classList.remove('listening');
      btn.setAttribute('aria-pressed', 'false');
      label.textContent = 'Start Listening';
      status.textContent = 'Tap the mic to begin. It will listen continuously.';
    }
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

    const ai = $('#setting-ai-enabled'); ai.checked = state.settings.aiEnabled;
    ai.addEventListener('change', () => { state.settings.aiEnabled = ai.checked; save(); });

    const k = $('#setting-api-key'); k.value = state.settings.apiKey || '';
    k.addEventListener('change', () => { state.settings.apiKey = k.value.trim(); save(); });

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

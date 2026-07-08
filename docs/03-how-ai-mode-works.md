# 3️⃣ How the AI Integration Works

*(The technical side — how the app talks to the LLM gateway, what it costs, and how failures are handled.)*

Sunodukaan uses an **LLM (Large Language Model)** as its only classifier. The app calls it through the **Bifrost gateway** — an OpenAI-compatible endpoint that routes requests to models like `gpt-5.5` and `gpt-4o`. Doc #2 explained *what* the model does for the app. This doc explains *how* the connection works.

---

## Setup — enabling AI

The app ships with a **default Bifrost API key already configured**, so it works out of the box. If that key gets rotated or rate-limited, you can override it:

1. Get a Bifrost gateway key (issued for this buildathon, or your own if you host Bifrost).
2. In the app, go to **⚙️ Settings**.
3. Paste the key into **Bifrost API Key**.
4. Optionally choose the model (`gpt-5.5` recommended, `gpt-4o` also available).
5. Tap **Test AI connection** to verify. You should see ✅ Works.

Your key is stored **only** in your browser's localStorage. It never touches any server other than the Bifrost gateway itself. You can verify this by reading `app.js` — search for `AI_ENDPOINT`.

Until an API call succeeds, the app records raw speech and queues each chunk. Any queued chunks can be reprocessed with the **Process pending transcripts** button.

---

## The API call, step by step

When a chunk of speech is finalized (12 seconds of silence has passed), this code runs (`app.js`):

```javascript
async function aiExtract(chunkText) {
  const res = await fetch('https://gateway-buildathon.ltl.sh/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${userKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.5',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: AI_SYSTEM },
        { role: 'user', content: `Conversation:\n"""\n${chunkText}\n"""\nExtract...` },
      ],
    }),
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  // ... parse JSON out of text
}
```

In plain English:

1. Open an internet request to the Bifrost gateway.
2. Attach the API key as a Bearer token.
3. Choose the model — **gpt-5.5** by default (or gpt-4o if selected).
4. Send the **system prompt** as a system-role message (permanent instructions — see [doc #2 Step D](02-how-understanding-works.md)).
5. Send the **user message** with the conversation chunk to classify.
6. Get back JSON inside `choices[0].message.content`.

Total time: usually 1-2 seconds per chunk. During that time, the app keeps listening — the network call is asynchronous.

---

## Which model and why

The app supports two models through Bifrost:

- **`gpt-5.5`** (default) — the more capable model. Best for nuanced Hindi/Hinglish classification.
- **`gpt-4o`** — a solid alternative. Slightly faster.

You can switch between them any time from **⚙️ Settings → Model**.

Whichever you pick, the app expects the same **OpenAI-style chat completion API** — Bifrost is designed to be a drop-in gateway that translates requests to whichever underlying provider actually serves the model.

---

## How much does it cost?

Because Sunodukaan calls Bifrost (not a specific provider directly), the per-token cost depends on how Bifrost is billed for your account. For the buildathon setup, calls are covered by the credit issued with your Bifrost key — no per-interaction cost until you exhaust the quota.

To get a sense of scale: a typical customer interaction uses roughly:

| Piece | Tokens |
|---|---|
| System prompt (fixed, shared across calls) | ~800 |
| Chunk text | ~40 |
| Total input | **~840** |
| Model's JSON reply | ~80 |
| Total output | **~80** |

If Bifrost passes through actual provider costs, that's around $0.001–$0.005 per interaction depending on model (very roughly ₹0.10–₹0.40). Under typical shop load (200 interactions/day), monthly cost sits in the low hundreds of rupees at most.

If you hit rate limits or your credit runs out, requests will fail — but the app queues them (see below) and you can top up and reprocess later.

---

## Handling failure — the pending queue

The internet is unreliable and APIs can throttle. Sunodukaan handles this by never dropping a chunk:

```javascript
try {
  items = await aiExtract(text);
  // Save each interaction
} catch (e) {
  state.pending.push({ id: uid(), ts, text });   // queue for later
  save();
}
```

Any of these situations lands the chunk in the pending queue:

- Your Bifrost API key is wrong or expired
- Your Bifrost quota ran out
- Your internet dropped mid-request
- The Bifrost gateway is temporarily unavailable
- You cleared the app's storage and haven't re-entered the key

The banner at the top of the app shows how many chunks are pending. Clicking **Process now** (or the button in Settings) sends the whole queue through Claude one by one, and each successful call becomes an interaction record.

You never lose spoken data.

---

## A note on key exposure

The default Bifrost key is committed into `app.js` so the app works out of the box. That means **anyone who visits your GitHub Pages URL can see the key and use its quota**. For a buildathon that's usually fine (keys rotate). For a production shop tool you would want to either:

1. Move the key to a small backend proxy you control (Cloudflare Worker, Vercel Function, etc.), or
2. Ask each user to paste their own key in Settings and clear the shipped default.

For now the setup prioritizes zero-setup for the shopkeeper.

---

## What Claude sees vs. what it sends back

**Sent to the model via Bifrost (input):**

```
System prompt:
  [~800 tokens of instructions about the task, schema, examples]

User message:
  Conversation:
  """
  Bhaiya, sugar hai kya? Haan, 45 rupaye kilo. Arey bahot mahenga hai, chodo.
  """
  Extract interactions as JSON.
```

**Received from the model (output):**

```json
{
  "interactions": [
    {
      "product": "Sugar",
      "outcome": "lost_expensive_here",
      "price": 45,
      "reason": "Customer said price is too high",
      "snippet": "sugar hai kya? Haan, 45 rupaye kilo. Arey bahot mahenga hai, chodo."
    }
  ]
}
```

The app extracts the JSON block from the model's response (`text.match(/\{[\s\S]*\}/)`), parses it, and saves each interaction. That's the entire cycle.

---

## Privacy: what data leaves your device?

When AI extraction runs, these two things go to the Bifrost gateway:

- Your API key (as an `Authorization: Bearer …` HTTP header, encrypted over HTTPS)
- The chunk of conversation text (as the user message)

That's it. The audio does not go to the gateway — the audio was already turned into text by your browser's speech engine before the app ever saw it.

Bifrost is a gateway, meaning your text gets forwarded to whichever upstream provider actually hosts the model (`gpt-5.5` / `gpt-4o`). Their data-retention and training policies then apply. Check with your Bifrost operator to understand the exact routing for your account.

If that trade-off is unacceptable — for example, if your shop's conversations are sensitive — you would need to run a local model (like Ollama with Llama or Qwen) instead. That's more complex and outside the scope of a browser-only app.

---

**Next:** [4️⃣ How Storage Works →](04-how-storage-works.md)

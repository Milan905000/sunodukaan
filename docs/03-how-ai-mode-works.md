# 3️⃣ How the AI Integration Works

*(The technical side — how the app talks to Anthropic's API, what it costs, and how failures are handled.)*

Sunodukaan uses **Claude** (Anthropic's language model) as its only classifier. Doc #2 explained *what* Claude does for the app. This doc explains *how* the connection works.

---

## Setup — enabling AI

1. Get an API key from [https://console.anthropic.com](https://console.anthropic.com). This requires signing up (free) and adding a small amount of credit ($5 is plenty to start).
2. In the app, go to **⚙️ Settings**.
3. Paste the key into **Anthropic API Key**.
4. Tap **Test AI connection** to verify. You should see ✅ Works.

Your key is stored **only** in your browser's localStorage. It never touches any server other than Anthropic's own API. You can verify this by reading `app.js` — search for `AI_ENDPOINT`.

Until you add the key, the app records raw speech but does not extract insights. Once you add the key, any chunks already captured can be reprocessed with the **Process pending transcripts** button.

---

## The API call, step by step

When a chunk of speech is finalized (12 seconds of silence has passed), this code runs (`app.js`):

```javascript
async function aiExtract(chunkText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': userKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      system: AI_SYSTEM,
      messages: [{ role: 'user', content: `Conversation:\n"""\n${chunkText}\n"""\nExtract...` }],
      max_tokens: 1024,
    }),
  });
  // ... parse response
}
```

In plain English:

1. Open an internet request to Anthropic's servers.
2. Attach the API key (so Anthropic knows which account to bill).
3. Choose the model — **Claude Haiku 4.5**, the fastest and cheapest, which is good enough for this task.
4. Send the **system prompt** (permanent instructions — see [doc #2 Step D](02-how-understanding-works.md)).
5. Send the **user message** — the conversation chunk to classify.
6. Get back JSON with the extracted interactions.

Total time: usually 1-2 seconds per chunk. During that time, the app keeps listening — the network call is asynchronous.

---

## Which model and why

The exact model ID is `claude-haiku-4-5-20251001`. Haiku is Anthropic's fastest and cheapest tier. Why we chose it:

- ✅ **Fast** — 1-2 seconds per chunk, so the app feels live.
- ✅ **Cheap** — roughly ₹0.03 per customer interaction (see cost math below).
- ✅ **Good at Hindi and Hinglish** — its training covers Indian languages well.
- ✅ **Good at JSON output** — the model reliably follows the structured schema, which is critical because the app needs machine-readable answers.

Bigger models (Sonnet, Opus) would be marginally more accurate but 5-10× more expensive. For classifying shop interactions, Haiku is the sweet spot.

---

## How much does it cost?

At the time of writing, Claude Haiku 4.5 is priced roughly at:

- **$1 per million input tokens**
- **$5 per million output tokens**

A **token** is roughly ¾ of a word. Every request has both input (the system prompt + the chunk) and output (Claude's JSON reply).

Sunodukaan's typical numbers per customer interaction:

| Piece | Tokens |
|---|---|
| System prompt (fixed, shared) | ~800 |
| Chunk text | ~40 |
| Total input | **~840** |
| Claude's JSON reply | ~80 |
| Total output | **~80** |

Cost per interaction:

- Input: `840 tokens × $1 / 1,000,000` = **$0.00084**
- Output: `80 tokens × $5 / 1,000,000` = **$0.00040**
- **Total ≈ $0.0012 per interaction** ≈ **₹0.10 per interaction** at ₹85/USD

For a shop with 200 interactions per day:

- Per day: 200 × ₹0.10 = **₹20**
- Per month: ≈ **₹600**

For a smaller shop (50 interactions per day): about **₹150 / month**.

If you find this too expensive, Anthropic also offers **prompt caching**, which would drop the cost by ~80% because the same big system prompt is sent on every request. That's an easy optimization to add later; ping if you want it done.

Anthropic bills your account monthly against credit you added at signup. If your credit runs out, requests will fail — but the app queues them and you can top up and reprocess.

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

- Your API key is wrong or expired
- Your Anthropic credit ran out
- Your internet dropped mid-request
- Anthropic's service is temporarily unavailable
- You started using the app before setting a key

The banner at the top of the app shows how many chunks are pending. Clicking **Process now** (or the button in Settings) sends the whole queue through Claude one by one, and each successful call becomes an interaction record.

You never lose spoken data.

---

## Why the "anthropic-dangerous-direct-browser-access" header?

You'll notice this header:

```javascript
'anthropic-dangerous-direct-browser-access': 'true'
```

This is Anthropic saying: *"Normally, we don't want people calling this API from a browser because their API key would be exposed to anyone using their site. If you know what you're doing and you own the key, opt in with this flag."*

For Sunodukaan, this is fine because:

- **You are the only user of your instance** — you paste your own key on your own device.
- Your key never leaves your browser's storage.
- If someone else opens the same GitHub Pages URL, they'd have to paste *their own* key.

If you were building a product with hundreds of users, you'd put a small server in the middle that holds one shared key. For a single-shopkeeper personal tool, direct-from-browser is fine.

---

## What Claude sees vs. what it sends back

**Sent to Claude (input):**

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

**Received from Claude (output):**

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

The app extracts the JSON block from Claude's response (`text.match(/\{[\s\S]*\}/)`), parses it, and saves each interaction. That's the entire cycle.

---

## Privacy: what data leaves your device?

When AI extraction runs, these two things go to Anthropic:

- Your API key (as an HTTP header, encrypted over HTTPS)
- The chunk of conversation text (as the user message)

That's it. The audio does not go to Anthropic — the audio was already turned into text by your browser's speech engine before the app ever saw it.

According to Anthropic's [data usage policy](https://www.anthropic.com/legal/commercial-terms), API traffic is not used to train their models by default. Data may be retained for a limited window for safety review.

If that trade-off is unacceptable — for example, if your shop's conversations are sensitive — you would need to run a local model (like Ollama with Llama or Qwen) instead. That's more complex and outside the scope of a browser-only app.

---

**Next:** [4️⃣ How Storage Works →](04-how-storage-works.md)

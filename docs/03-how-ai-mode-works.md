# 3️⃣ How AI Mode Works

*(Optional feature — turn it on in Settings for much better accuracy on real Hindi conversations.)*

## What changes when AI mode is on?

Rules mode (the default) is like a very fast but limited assistant with a printed cheat-sheet of Hindi phrases. It's great at obvious cases but misses nuance.

AI mode replaces the cheat-sheet with **Claude** — a large language model — that actually **reads and understands** the conversation like a person would. When AI mode is on:

- Everything about listening (Step A → Step C in doc #2) stays the same.
- But instead of running the "match keywords" logic, the chunk of text is sent to Claude, which returns structured data.

That means:

- ✅ It understands sarcasm, negation, and idioms.
- ✅ It handles multiple products in one conversation.
- ✅ It recognizes brand names and product varieties it has never seen before.
- ✅ It figures out prices spoken in words (like "पैंतालीस").
- ❌ It costs money (a very small amount — see below).
- ❌ It requires internet.
- ❌ It's slower by 1–2 seconds per chunk.

For most shops, the AI mode is worth turning on for the accuracy alone. It's genuinely much better.

---

## How to enable it

1. Get an API key from [https://console.anthropic.com](https://console.anthropic.com). This requires signing up (free) and adding at least $5 of credit.
2. In the app, go to **⚙️ Settings**.
3. Paste the key into **Anthropic API Key**.
4. Tick the **Use Claude AI for extraction** box.
5. Tap **Test AI connection** to verify.

Your key is stored **only** in your browser's localStorage. It never touches any server other than Anthropic's own API. (You can verify this by reading the source code in `app.js` — search for `AI_ENDPOINT`.)

---

## What actually happens under the hood

When a chunk of speech is finalized, this code runs (`app.js`):

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
2. Include the API key (so Anthropic knows it's you).
3. Tell it which Claude model to use — we use **Claude Haiku 4.5**, the fastest and cheapest one, which is good enough for this task.
4. Include a **system prompt** telling Claude *how* to think about the task.
5. Include the actual conversation snippet.
6. Get back JSON with the extracted interactions.

---

## The "system prompt" — how we instruct Claude

The most important piece is the instruction we give Claude. It's stored in a constant called `AI_SYSTEM`:

> You extract retail-shop customer interactions from short conversation snippets (typically Hindi, English, or Hinglish, spoken between a shopkeeper and a customer). Return valid JSON only. No preamble.
>
> Schema: `{"interactions": [{"product": "<English name>", "outcome": "sold|lost_expensive_here|lost_cheaper_elsewhere|lost_other|oos|unclear", "price": <number or null>, "reason": "<short reason or null>", "snippet": "<verbatim short snippet>"}]}`
>
> Outcome definitions:
> - **sold**: customer decided to buy
> - **lost_expensive_here**: customer said the shop's price is too high
> - **lost_cheaper_elsewhere**: customer said they can get it cheaper elsewhere
> - **lost_other**: customer decided not to buy for another reason
> - **oos**: the shopkeeper said the item is not in stock / khatam / kal aayega — this means reorder
> - **unclear**: mention of a product but no clear outcome
>
> Only include interactions where a real product is mentioned. Ignore chitchat. If nothing found, return `{"interactions": []}`.

This is a real, working prompt. It says three things clearly:

1. **What Claude's job is** — extract shop interactions.
2. **The exact JSON format** it must respond in.
3. **The meaning of every outcome category** so it doesn't make up its own.

Claude follows the schema and always returns machine-readable JSON. The app then parses that JSON and saves each interaction just like it would from rules mode.

---

## An example call

Let's trace the same "sugar" conversation through AI mode:

**Input** sent to Claude:

```
Conversation:
"""
Bhaiya, sugar hai kya? Haan, 45 rupaye kilo. Arey bahot mahenga hai, chodo.
"""
Extract interactions as JSON.
```

**Response** from Claude (roughly):

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

Same final answer as rules mode — but Claude got there by *understanding* the conversation, not by matching keywords. On a harder conversation like:

> "Bhaiya, Amul milk 500ml aur Parle-G ka bada packet, aur agar Dettol soap fresh stock aaya hai to woh bhi. Milk aur biscuit ke total 65 mein de do, soap mahenga hai chodo."

Rules mode would grab just one product. Claude will return three separate interactions:

```json
{
  "interactions": [
    {"product": "Milk", "outcome": "sold", "price": null, "reason": null, "snippet": "..."},
    {"product": "Biscuits", "outcome": "sold", "price": null, "reason": null, "snippet": "..."},
    {"product": "Soap", "outcome": "lost_expensive_here", "price": null, "reason": "Customer said soap is too expensive", "snippet": "..."}
  ]
}
```

That's the real value of AI mode.

---

## How much does it cost?

We use Claude Haiku 4.5, priced (at time of writing) at roughly:

- **$1 per million input tokens** (roughly 750,000 words)
- **$5 per million output tokens**

A single chunk is typically 40 input tokens + 60 output tokens = 100 tokens total. So one interaction costs about **$0.0004** — that is *four hundredths of a paisa* in Indian rupee terms.

At 200 interactions per day, that's about **8 cents (₹7) per month**. Even at 1000 interactions per day, roughly **₹35 per month**.

Anthropic bills you monthly against the credit you added at signup.

---

## The safety net: AI mode falls back to rules mode

If the AI request fails for any reason (bad internet, invalid API key, Claude is temporarily overloaded), the app doesn't lose the data. This is what happens:

```javascript
try {
  items = await aiExtract(joined);
} catch (e) {
  console.error('AI extraction failed, falling back to rules', e);
  toast('AI extraction failed — using keyword mode');
  const r = ruleExtract(chunk);
  if (r) items = [r];
}
```

Translation: "Try Claude. If it fails, run the keyword rules instead. Never drop the chunk on the floor."

You'll see a small toast message when this happens so you know something went wrong. Your data continues being captured either way.

---

## Why Anthropic's dangerous-direct-browser-access header?

You'll notice this header in the code:

```javascript
'anthropic-dangerous-direct-browser-access': 'true'
```

This is Anthropic saying: *"Normally, we don't want people calling this API directly from a browser because their API key would be exposed to anyone using their site. If you really know what you're doing and you're OK with that, opt in with this flag."*

For Sunodukaan, this is fine because:

- **You are the only user** of your instance — you paste your own key, on your own device.
- Your key never leaves your browser's storage.
- If someone else visited the site, they'd have to paste their own key.

If you were building a product with hundreds of users, you would put a small server in the middle that holds one shared key. For a single-shopkeeper personal tool, the direct approach is fine.

---

## Turning AI off

Any time, un-tick **Use Claude AI for extraction** in Settings. The app immediately switches back to rules mode. Your existing data is untouched.

---

**Next:** [4️⃣ How Storage Works →](04-how-storage-works.md)

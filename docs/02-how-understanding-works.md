# 2️⃣ How Understanding Works

*(The heart of the app: how a stream of raw text becomes structured business data — product names, outcomes, and reasons — using Claude.)*

Let's use a real example throughout this document. Say a customer walks in and this conversation happens:

> **Customer:** *"Bhaiya, sugar hai kya?"*
> **Shopkeeper:** *"Haan, 45 rupaye kilo."*
> **Customer:** *"Arey bahot mahenga hai, chodo."*

By the end of this document, you'll understand exactly how the app turns those three lines into a record that says:

```
Product:  Sugar
Outcome:  Lost — my price too high
Price:    ₹45
```

There is **only one way** the app does this classification: it sends the conversation to **Claude** (Anthropic's language model) and reads the structured answer back. That's why you must add an Anthropic API key in Settings for the app to work — without it, the app can still record raw speech, but it cannot understand it.

---

## Step A — Grouping speech into "chunks"

The first challenge: how does the app know where one customer's conversation ends and the next one begins?

There is no reliable way to detect *who* is speaking, but there's a very reliable signal we can use: **silence between conversations**. Customers usually leave a gap of several seconds when they walk away.

So the app uses this rule:

> **A silence of 12 seconds means the current conversation is over. Everything spoken before that silence is one "chunk".**

Here's how it looks in the code (`app.js`):

```javascript
const GAP_MS = 12000; // 12 seconds

function addUtterance(text) {
  pendingUtterances.push({ ts: nowISO(), text });
  scheduleFlush();      // restart the 12-second timer
}

function scheduleFlush() {
  if (gapTimer) clearTimeout(gapTimer);
  gapTimer = setTimeout(flushChunk, GAP_MS);
}
```

Whenever someone speaks, the timer resets. When 12 seconds pass with no new speech, `flushChunk` runs — and *that* is when the classification kicks in.

Why 12 seconds? Long enough to survive a natural pause ("uhh, wait let me check my list"), short enough that customer #1 and customer #2 don't get merged. You could change this number in the code if you have a very fast-moving shop.

---

## Step B — What's inside a chunk?

Once a chunk is complete, its content is basically a mini-conversation, usually 1–4 sentences long, in Hindi/English/Hinglish. For our example, the chunk contains:

```
"Bhaiya, sugar hai kya?"
"Haan, 45 rupaye kilo."
"Arey bahot mahenga hai, chodo."
```

The app joins these into one string and now needs to extract three things:

1. **What product** was being discussed?
2. **What was the outcome?** (Was it sold? Was it a loss? Was it out of stock?)
3. **Why**, if it was a lost sale?

Claude does all three at once.

---

## Step C — Handing it to Claude

The app sends the chunk to Claude with two things attached:

1. **A system prompt** — permanent instructions telling Claude what its job is, what the output format looks like, and what each classification means.
2. **The chunk text** — the actual conversation to analyze.

The Claude API call is a few lines of code (`app.js`):

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
  // Parse the JSON that comes back
}
```

Claude responds in about 1-2 seconds with structured JSON. The app parses it and saves the interactions.

**The most important part** is the system prompt — it's how we tell Claude exactly how to classify things.

---

## Step D — The system prompt (how we teach Claude)

Below is the actual system prompt used in the code. Read it slowly — it defines everything about how the app understands your shop.

> You extract structured retail-shop customer interactions from short conversation snippets between a shopkeeper (kirana / grocery / FMCG store owner in India) and their customers. The speech will be in Hindi, English, Hinglish (mixed), or another Indian language. The transcript is imperfect — expect misspellings, spoken numerals, brand names, and casual grammar.
>
> RETURN VALID JSON ONLY. No preamble, no code fences, no explanation.
>
> **Schema:**
> ```json
> {
>   "interactions": [
>     {
>       "product": "<English product name — normalize brand+category>",
>       "outcome": "sold | lost_expensive_here | lost_cheaper_elsewhere | lost_other | oos | unclear",
>       "price": <number in INR or null>,
>       "reason": "<short human-readable reason or null>",
>       "snippet": "<verbatim spoken text, ≤200 chars>"
>     }
>   ]
> }
> ```
>
> **Outcome definitions** (very important — classify carefully):
>
> - **sold** — the customer clearly decided to buy (phrases like "de do", "pack karo", "theek hai", "le lunga", "chalo", "ok").
> - **lost_expensive_here** — customer refused because THIS SHOP'S price is too high ("mahenga hai", "zyada hai", "kam karo", "discount do").
> - **lost_cheaper_elsewhere** — customer said they can get it cheaper somewhere else ("wahan sasta milta hai", "dusri dukan pe sasta", "aur jagah kam mein").
> - **lost_other** — customer did not buy for some other reason (not needed now, will come back later, just asking, changed mind) — NOT because of price and NOT because you were out of stock.
> - **oos** — the SHOPKEEPER said the item is not in stock, will come tomorrow, is finished ("nahi hai", "khatam ho gaya", "kal aayega", "stock nahi"). This means reorder.
> - **unclear** — a product was clearly mentioned but the outcome cannot be determined.
>
> **Rules for extraction:**
>
> 1. Only extract interactions where a REAL product is discussed. Ignore pure chit-chat, greetings, weather talk.
> 2. If several products are discussed in the same snippet, return one interaction per product.
> 3. Normalize product names to their standard English name. If a brand is spoken, keep it in the name ("Dettol Soap", not just "Soap").
> 4. Prices: capture the number quoted. If spoken in words (e.g., "पैंतालीस"), convert to digits. If no price is mentioned, use null.
> 5. If lost_expensive_here vs lost_cheaper_elsewhere both apply, prefer lost_cheaper_elsewhere (it's more specific).
> 6. Do not invent outcomes. If truly ambiguous, use "unclear".
> 7. If nothing product-related is found, return `{"interactions": []}`.

The prompt also includes **worked examples** so Claude sees exactly how a sugar/soap/milk snippet should be turned into JSON. Few-shot examples make the model much more consistent.

---

## Step E — Reading Claude's answer

For our sample conversation, Claude will return something like:

```json
{
  "interactions": [
    {
      "product": "Sugar",
      "outcome": "lost_expensive_here",
      "price": 45,
      "reason": "Customer said the price is too high",
      "snippet": "sugar hai kya? Haan, 45 rupaye kilo. Arey bahot mahenga hai, chodo."
    }
  ]
}
```

The app parses this JSON, wraps each `interaction` with a unique ID and timestamp, and pushes it into your list of records. Everything you see in the dashboard and summary is built from these records.

---

## Why this is much better than keyword matching

Claude doesn't just spot words — it understands the meaning of the sentence. For example:

### Case 1 — Negation

> *"Sugar mahenga NAHI hai, de do."* ("Sugar is NOT expensive, give me some.")

A keyword-matching system would see "mahenga" and classify this as a lost sale.

Claude reads "mahenga NAHI hai" and correctly classifies it as **sold**.

### Case 2 — Multiple products in one visit

> *"Amul milk aur bread. Milk 30 aur bread 40. Bread aur jagah 30 mein milta hai, sirf milk de do."*
> ("Amul milk and bread. Milk 30 and bread 40. Bread costs 30 elsewhere, just give me the milk.")

Claude returns TWO interactions:

```json
{
  "interactions": [
    { "product": "Amul Milk", "outcome": "sold", "price": 30, ... },
    { "product": "Bread", "outcome": "lost_cheaper_elsewhere", "price": 40, ... }
  ]
}
```

That's near-impossible with keyword rules.

### Case 3 — Unknown brands

> *"Bhaiya, Yippee noodles 5 rupaye ka packet dena."*

Even if "Yippee" isn't in any dictionary, Claude recognizes it as a noodles brand and returns `"product": "Yippee Noodles"`. Rules would either miss it or, at best, classify it as "Maggi" incorrectly.

### Case 4 — Price in words

> *"पैंतालीस रुपये है bhaiya, ठीक है le lunga."*

Claude reads "पैंतालीस" (forty-five) and returns `"price": 45`. A keyword-based extractor would need to encode every Hindi number word to catch that.

---

## What happens when the API call fails

Real life has hiccups: bad internet, an invalid API key, or Anthropic temporarily throttling requests. Sunodukaan handles this without losing your data:

```javascript
try {
  items = await aiExtract(text);
} catch (e) {
  // Save the chunk to a pending queue instead of dropping it
  state.pending.push({ id: uid(), ts, text });
  save();
}
```

In practice:

- The **raw transcript is always kept** the moment the mic hears it — before extraction is even attempted.
- If Claude fails to classify a chunk, it goes into a **pending queue**.
- A banner shows up at the top of the app: *"N chunks queued for AI processing"* with a **Process now** button.
- The same happens if you use the app before setting your API key: the transcript is captured, and once you paste your key in Settings, tap **Process pending transcripts** and everything gets classified retroactively.

**You never lose spoken data**, even if the AI is temporarily unavailable.

---

## The mental model to keep

```
Raw text
   ↓
Split into chunks by 12-second silences
   ↓
For each chunk:
   ↓
Send it to Claude with the system prompt
   ↓
Claude returns structured JSON: product + outcome + price + reason
   ↓
Save each interaction to storage
   ↓
Dashboard updates
```

There is no keyword list. No priority rules. No brittle regex. The entire classification is Claude reading the conversation like a human clerk would.

---

## Limits to be aware of

- Claude is very good but not perfect. If a conversation is genuinely ambiguous, it will (correctly) mark it as `unclear`. Open it in the Log tab and fix it manually.
- Very long chunks (multiple minutes of speech) get truncated at Claude's token limit. In practice, the 12-second silence rule keeps chunks short.
- The API costs money — roughly ₹0.03 per customer interaction. That is described in the [next doc](03-how-ai-mode-works.md).

---

**Next:** [3️⃣ How the AI Integration Works →](03-how-ai-mode-works.md)

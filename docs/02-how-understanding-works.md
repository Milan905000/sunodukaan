# 2️⃣ How Understanding Works

*(This is the heart of the app: how a stream of raw text becomes structured business data — product names, outcomes, and reasons.)*

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

Whenever someone speaks, the timer resets. When 12 seconds pass with no new speech, `flushChunk` runs — and *that* is when the understanding logic kicks in.

Why 12 seconds? Long enough to survive a natural pause ("uhh, wait let me check my list"), short enough that customer #1 and customer #2 don't get merged into the same chunk. You could change this number in the code if you have a very fast-moving shop.

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

There are two ways the app does this:

- 🧠 **Rules mode** — pattern matching against a built-in list of Hindi/English keywords. Fast, free, no internet needed beyond the speech engine, but not perfect.
- 🤖 **AI mode (optional)** — send the chunk to Claude and let it read the conversation intelligently. Much more accurate. See [How AI Mode Works](03-how-ai-mode-works.md).

The rest of this document explains **Rules mode** because that's what runs by default.

---

## Step C — Finding the product name

The app has a built-in dictionary of about **60 common Indian grocery / FMCG products**. For each product, it stores every reasonable way a customer might refer to it.

Here's a real entry from the code (`app.js`):

```javascript
{ en: 'Sugar', keys: ['sugar', 'chini', 'cheeni', 'shakar', 'shakkar', 'चीनी', 'शक्कर'] }
```

That single product has **7 different keys** covering:

- 🇬🇧 English word — `sugar`
- 🇮🇳 Hinglish spellings — `chini`, `cheeni`
- Regional variants — `shakar`, `shakkar`
- 🕉️ Devanagari script — `चीनी`, `शक्कर`

For each chunk of speech, the app does this:

```javascript
function detectProduct(text) {
  const lower = text.toLowerCase();
  let bestMatch = null;
  let bestLen = 0;

  for (const p of PRODUCTS) {
    for (const k of p.keys) {
      if (lower.includes(k) && k.length > bestLen) {
        bestMatch = p.en;
        bestLen = k.length;
      }
    }
  }
  return bestMatch;
}
```

In plain English:

> "Go through every product in the dictionary. For each one, check every possible spelling. If one of those spellings appears in the customer's text, mark it as a match. If multiple products match, keep the one with the longest matching phrase (because that's usually more specific)."

For our example, the text contains the word `sugar` → the app records **`Sugar`** as the product.

The "longest match" rule is important. Consider "coconut oil" vs "oil" — if a customer says "coconut oil chahiye", both `oil` and `hair oil` (which contains "coconut oil" in its keys) match. Because "coconut oil" (11 letters) is longer than "oil" (3 letters), the more specific match wins.

The full product dictionary covers:

- **Staples**: sugar, salt, rice, atta, dal, tea, coffee, oil, ghee
- **Dairy**: milk, curd, paneer, butter, cheese, bread, eggs
- **Snacks**: biscuits, chips, namkeen, chocolate, Maggi
- **Beverages**: Coke, Pepsi, Thums Up, Limca, Sprite, Frooti/Maaza, water, juice
- **Personal care**: soap, shampoo, toothpaste, hair oil, cream, sanitary pads
- **Cleaning**: detergent, dishwash, floor cleaner, agarbatti, matches
- **Vegetables**: onion, potato, tomato, ginger, garlic, lemon, coriander
- **Others**: batteries, mosquito repellent, cigarettes, gutkha

Plus **all the major Indian brand names** (Parle-G, Amul, Dettol, Colgate, Surf, Ariel, Nirma, Bisleri, Haldiram, etc.) so if a customer asks by brand it still gets categorized correctly.

---

## Step D — Figuring out the outcome

Once we know the product, we need to know what happened. The rules are stacked in order of priority:

### Rule 1: Was the item unavailable?

The app looks for phrases that indicate the shopkeeper said "we don't have it":

```javascript
const AVAIL_NO = [
  'nahi hai', 'नहीं है', 'khatam', 'खतम',
  'out of stock', 'stock nahi', 'stock khatam',
  'kal aayega', 'kal aa jayega', 'abhi nahi',
  'khatm ho gaya', 'नहीं मिलेगा'
];
```

If any of these appear anywhere in the chunk, the outcome is **`oos`** (out-of-stock) and this product gets added to the **reorder list**.

### Rule 2: Did the customer decide to buy?

Positive purchase phrases:

```javascript
const BUY_YES = [
  'de do', 'de dijiye', 'pack karo', 'दे दो',
  'le lunga', 'लूँगा', 'theek hai', 'ठीक है',
  'ok de do', 'chalo', 'pack it'
];
```

Any of these = outcome **`sold`**. The price captured in the chunk becomes the sale price.

### Rule 3: Did the customer refuse because it was too expensive here?

```javascript
const REJ_EXPENSIVE_HERE = [
  'mahenga', 'mehnga', 'महँगा', 'महंगा',
  'expensive', 'costly', 'jyada hai', 'zyada hai',
  'ज़्यादा है', 'kam kar do', 'discount',
  'high price', 'itna nahi'
];
```

If any of these appear = outcome **`lost_expensive_here`** ("my price is too high").

### Rule 4: Did the customer refuse because they get it cheaper somewhere else?

```javascript
const REJ_CHEAPER_ELSEWHERE = [
  'sasta milta', 'wahan sasta', 'aur sasta',
  'सस्ता मिलता', 'aur jagah', 'dusri jagah',
  'दूसरी जगह', 'other shop', 'wholesale',
  'दुकान पर सस्ता'
];
```

If any of these appear = outcome **`lost_cheaper_elsewhere`** ("cheaper elsewhere").

### Rule 5: Did they refuse for some other reason?

```javascript
const BUY_NO = [
  'nahi lena', 'nahi chahiye', 'नहीं चाहिए',
  'chodo', 'rehne do', 'रहने दो',
  'kal aaunga', 'baad mein', 'बाद में', 'skip'
];
```

If any of these appear (and none of the more specific rules did) = outcome **`lost_other`**.

### Rule 6: If none of the above matched

The outcome is marked **`unclear`**. You can then open it in the Log tab and correct it manually.

### The priority order

Here's the actual code that decides:

```javascript
if (availableSaid === false) {
  outcome = 'oos';
} else if (bought === true) {
  outcome = 'sold';
} else if (cheaperElsewhere) {
  outcome = 'lost_cheaper_elsewhere';
} else if (expensiveHere) {
  outcome = 'lost_expensive_here';
} else if (bought === false) {
  outcome = 'lost_other';
} else {
  outcome = 'unclear';
}
```

Reading top-to-bottom:

1. If the shopkeeper said "nahi hai" → **out of stock** (nothing else matters).
2. Otherwise, if the customer said "de do" → **sold**.
3. Otherwise, if they mentioned cheaper elsewhere → **cheaper elsewhere** (this beats "expensive here" because it's more specific).
4. Otherwise, if they mentioned expensive → **too expensive here**.
5. Otherwise, if they said "nahi" or "chodo" without a clear reason → **lost, other**.
6. Otherwise → **unclear**.

---

## Step E — Pulling out the price

Prices in Indian speech look like these:

- "45 rupaye kilo"
- "₹45"
- "Rs 45"
- "45 rupees"
- "पैंतालीस रुपये"

The app uses **regular expressions** (patterns that match text) to spot them:

```javascript
const PRICE_RE = /(?:₹|rs\.?|rupees?|rupaye|रुपये|रुपैया)\s*(\d{1,5})|(\d{1,5})\s*(?:rs\.?|rupees?|rupaye|रुपये)/i;
```

In plain English:

> "Find either a currency word followed by digits (`₹45`, `Rs 45`), or digits followed by a currency word (`45 rupaye`, `45 Rs`)."

For our example — "**45 rupaye kilo**" — the pattern captures **`45`** as the price.

Prices spoken purely in words like "पैंतालीस" won't be caught by rules mode. AI mode handles those.

---

## Step F — Bringing it all together

Let's replay our example with what the app actually stores:

Input chunk:
```
"Bhaiya, sugar hai kya? Haan, 45 rupaye kilo. Arey bahot mahenga hai, chodo."
```

Processing:

| Check | Result |
|---|---|
| Product? | `sugar` → **Sugar** ✅ |
| Available said no? | No `nahi hai` found |
| Bought said yes? | No `de do` found |
| Cheaper elsewhere? | No match |
| Expensive here? | `mahenga` found ✅ |
| Bought said no? | `chodo` found |
| Price? | `45 rupaye` → **45** ✅ |

Outcome verdict: because "expensive here" matched before we got to "lost_other" in the priority order, **outcome = `lost_expensive_here`**.

Stored record:

```json
{
  "id": "abc123",
  "ts": "2026-07-08T10:32:15.234Z",
  "product": "Sugar",
  "outcome": "lost_expensive_here",
  "price": 45,
  "reason": "My price too high",
  "snippet": "Bhaiya, sugar hai kya? Haan, 45 rupaye kilo. Arey bahot mahenga hai, chodo.",
  "source": "rules"
}
```

This is the record that shows up in your dashboard, in the log, and in the daily summary.

---

## What the rule-based system is bad at

Let's be honest about limits:

- **Sarcasm or negation trickiness**: If a customer says "*sugar mahenga nahi hai*" (sugar is *not* expensive) — the app sees "mahenga" and flags it as a lost sale even though the customer probably bought it.
- **Products not in the dictionary**: If someone asks for "Real Juice Mango 1L Tetra Pack" — the app catches "juice" but loses all the detail.
- **Multiple products in one chunk**: If a customer asks for sugar, soap, and biscuits in one visit — the app finds the strongest match (probably one of them) and misses the other two.
- **Confusing conversations**: If the customer keeps changing their mind, the rules will often land on `unclear`.

That's why **AI Mode** exists — it uses Claude to actually understand the conversation. See [How AI Mode Works](03-how-ai-mode-works.md).

Also, remember: every interaction can be edited or added manually. When in doubt, just tap it and fix it.

---

## The mental model to keep

```
Raw text
   ↓
Split into chunks by 12-second silences
   ↓
For each chunk:
   ↓
Match against ~60 product dictionaries → product name
Match against reason keyword lists → outcome + reason
Match against price patterns → price
   ↓
Save a structured record
```

That's it. The whole "AI understanding" of the app is layered pattern matching — nothing magical, and nothing that requires the internet beyond what Google's speech engine already needs.

---

**Next:** [3️⃣ How AI Mode Works →](03-how-ai-mode-works.md)

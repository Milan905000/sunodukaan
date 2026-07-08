# 4️⃣ How Storage Works

*(Where your data actually lives, why it stays private, and what happens if you clear your browser.)*

## The short version

Sunodukaan has **zero servers**. Every interaction, every transcript, every setting lives in your browser's **localStorage** — a small database that every website is allowed to have on your device.

Think of it as a private notebook that only this website can read. Even other websites you visit can't see it.

---

## What is localStorage?

Modern browsers give each website a small amount of storage on your device (typically 5–10 MB). It works like a simple lookup table:

- You give it a **key** (a name) and a **value** (some text).
- Later, you ask for the value by the same key.

That's the whole thing. It's the simplest possible database.

For Sunodukaan, everything is stored under one key: `sunodukaan.v1`. The value is a big JSON blob that looks like this:

```json
{
  "settings": {
    "lang": "hi-IN",
    "autoRestart": true,
    "apiKey": ""
  },
  "interactions": [
    {
      "id": "abc123",
      "ts": "2026-07-08T10:32:15.234Z",
      "product": "Sugar",
      "outcome": "lost_expensive_here",
      "price": 45,
      "reason": "Customer said price is too high",
      "snippet": "sugar hai kya? ... mahenga hai chodo",
      "notes": "",
      "source": "ai"
    },
    { /* ... more interactions ... */ }
  ],
  "transcript": [
    { "id": "u1", "ts": "2026-07-08T10:32:12.100Z", "text": "sugar hai kya" },
    { /* ... more utterances ... */ }
  ],
  "pending": [
    { "id": "p1", "ts": "2026-07-08T10:33:00.000Z", "text": "..." }
  ]
}
```

There are **four** top-level sections:

| Section | What's in it |
|---|---|
| `settings` | Your preferences — language, auto-restart, your Anthropic API key |
| `interactions` | Every classified business record — this is what powers your dashboards |
| `transcript` | The raw text of what was said — for reviewing / debugging |
| `pending` | Conversation chunks the AI couldn't classify yet (no key, network error, etc.) — waiting to be re-processed |

---

## The save / load cycle

The app reads state on startup, and writes it back to localStorage every time anything changes:

```javascript
function load() {
  const raw = localStorage.getItem('sunodukaan.v1');
  return raw ? JSON.parse(raw) : DEFAULT_STATE;
}

function save() {
  localStorage.setItem('sunodukaan.v1', JSON.stringify(state));
}
```

So the sequence for every new interaction is:

```
Speech happens
    ↓
Extraction produces a record
    ↓
Record is pushed into state.interactions
    ↓
save() writes the whole state back to localStorage
    ↓
UI re-renders from the new state
```

Because saving happens after *every* change, if your browser crashes or your phone dies, at most you'll lose the very last interaction that was mid-processing.

---

## Why not a real database?

Because we don't need one. For a personal shopkeeper tool:

- **A single shop** = one device using it.
- **A day's worth of interactions** ≈ 100–500 records, at ~250 bytes each ≈ 100 KB. localStorage limit is 5–10 MB, so you have room for **years** of data.
- **No server** means no monthly cost, no login, no data breach risk.

The downside: your data is tied to *this browser on this device*. That's what the **Export** feature handles (see below).

---

## The privacy story

Let's be very concrete about who can see what:

| Data | Where it goes | Who can see it |
|---|---|---|
| Audio from mic | Google's (or Apple's) speech engine | Them, briefly, for transcription. Not stored. |
| Transcript text | Only your browser's localStorage | Only you |
| Extracted interactions | Only your browser's localStorage | Only you |
| Your API key (if you set one) | Only your browser's localStorage | Only you |
| Chunks sent to Claude (if AI is on) | Anthropic's API | Anthropic, per their policy |
| GitHub Pages logs | GitHub's web server | Standard web-request logs (IP, browser) — nothing about the shop itself |

**Nothing about your customers, your products, your prices, or your business is ever sent to any Sunodukaan server, because Sunodukaan has none.**

---

## What if I clear my browser?

If you:

- Clear the browser's site data, or
- Uninstall / reset the browser, or
- Switch to a different browser or device,

… your localStorage is gone. Your interactions with Sunodukaan will be gone too.

**How to protect yourself**: use the **Export** feature.

---

## Export & Import

In **⚙️ Settings → Data**, three buttons:

### Export all data (JSON)

Downloads a file called `sunodukaan-all-YYYY-MM-DD.json`. It contains everything — settings, all interactions, all transcripts.

Save this file to Google Drive, WhatsApp yourself, email it — whatever works. That's your backup.

### Export CSV (from the Summary tab)

Downloads a `sunodukaan-YYYY-MM-DD.csv` file for just that day. You can open this in Excel or Google Sheets to do your own analysis.

Each row is one interaction with columns:

```
ts, date, time, product, outcome, price, reason, notes, snippet, source
```

### Import data

Restores a previous export. Just tap Import and pick the file. New interactions are added to what's already there.

---

## How to move between devices

Say you started on your phone but want to continue on a laptop:

1. Phone → Settings → **Export all data**. Save the file.
2. Transfer the file to your laptop (email, Google Drive, WhatsApp Web, USB, whatever).
3. Laptop → open the Sunodukaan URL → Settings → **Import**. Pick the file.
4. Done.

Note: since data lives *per browser*, this is a one-time transfer, not a live sync. If you want live sync across multiple devices, you would need a real backend (Supabase, Firebase, etc.). That's outside the current scope.

---

## Deleting everything

Settings → **Delete all data**. It clears localStorage completely for this site. You'll see the app in its fresh, empty state — same as the first time you opened it.

Use this if:

- You're handing the device to someone else.
- You want to start over.
- You want to test the app fresh.

Cannot be undone. Export first if there's anything worth keeping.

---

**Next:** [5️⃣ How the Summary Works →](05-how-summary-works.md)

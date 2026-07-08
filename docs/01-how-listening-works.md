# 1️⃣ How Listening Works

*(How the app captures speech from the shop and turns it into text — continuously, all day.)*

## The very short version

Your phone or laptop has a **microphone**. Modern browsers (Chrome, Edge, Safari) have a built-in feature called the **Web Speech API** that:

1. Reads the microphone,
2. Sends the audio to Google's (or Apple's) speech engine,
3. Gets back the words in text form — including Hindi, English, or Hinglish.

Sunodukaan uses this feature. That's why you don't need any expensive equipment or a paid service — it's all in the browser you already have.

---

## Step-by-step

### Step 1 — You tap "Start Listening"

When you tap the big mic button, the browser pops up a permission prompt:

> "sunodukaan wants to use your microphone. Allow / Block"

You must tap **Allow** exactly once. After that, the browser remembers it for this website.

If you accidentally tap Block, you have to go into browser settings → Site settings → Microphone → Allow.

### Step 2 — The browser starts a recognition "session"

In the code, this is what happens:

```javascript
const recognition = new SpeechRecognition();
recognition.continuous = true;        // don't stop after one sentence
recognition.interimResults = true;    // show partial results as you speak
recognition.lang = 'hi-IN';           // Hindi (India)
recognition.start();
```

- `continuous = true` means it will keep listening across multiple sentences instead of stopping after the first one.
- `interimResults = true` means it will give a live preview of what it *thinks* you're saying, before it's finalized. That's what you see in the italic "…" text at the bottom of the transcript.
- `lang = 'hi-IN'` tells Google's engine "expect Hindi." You can change this in Settings.

### Step 3 — Audio goes to the cloud engine

Your voice is streamed to Google's servers (Chrome/Edge) or Apple's servers (Safari) in tiny chunks. They analyze the audio waveform, match it against a language model, and stream back **text** — usually within half a second.

- 🇮🇳 For Hindi, Google's engine is very good — it handles Hindi mixed with English (Hinglish) surprisingly well.
- The audio itself is **not stored** by Sunodukaan. Only the resulting text is saved.

### Step 4 — Two kinds of results

For each thing you say, the browser gives back two flavors of result:

| Type | What it is | Example |
|---|---|---|
| **Interim** | A live guess, may still change | *"sugar hai"* → shows in italics |
| **Final** | The engine's confident answer | *"sugar hai kya bhaiya"* → shows in the transcript list |

Sunodukaan only saves the **final** ones. Interim results are just for the live preview.

---

## The "always-on" trick — the important part

There is a *big problem* with the Web Speech API: **it turns itself off after about 30–60 seconds of silence**. Browsers do this to save battery and avoid wasting cloud resources.

For a shop, that's useless — you can't press "Start" every minute.

So Sunodukaan does this:

```
Recognition starts
     ↓
Customer & shopkeeper talk
     ↓
Everybody is quiet for 60 seconds
     ↓
Browser fires an "end" event  ← usually the app would stop here
     ↓
Sunodukaan catches this "end" event and immediately calls .start() again
     ↓
Recognition resumes seamlessly
```

In code, this is the `onEnd` handler in `app.js`:

```javascript
recognition.onend = () => {
  if (listening && !manualStop && state.settings.autoRestart) {
    setTimeout(() => recognition.start(), 250);
  }
};
```

The 250 ms delay is because Chrome complains if you restart *too* quickly. From the outside, the effect is: **it just keeps listening**.

You can turn this behaviour off in **Settings → Auto-restart on silence** if you want a "one session and done" mode.

---

## Handling errors

Real life has hiccups. The app watches for these and reacts:

| Error | What it means | What the app does |
|---|---|---|
| `not-allowed` | You blocked the mic | Shows a toast asking you to allow it |
| `audio-capture` | No mic detected | Shows a toast "No microphone" |
| `no-speech` | 20+ seconds of silence | Silently restarts |
| `network` | Internet dropped | Shows a warning; restarts when back |

---

## Why does the app need internet?

The speech engine (Google/Apple) runs *in the cloud*, not on your phone. So:

- No internet = no speech recognition.
- 3G/4G is fine — it uses maybe 10–20 MB per hour of active listening.
- If Wi-Fi drops for a moment, the app tries to reconnect automatically.

---

## Why not other browsers?

- ✅ **Chrome** (desktop or Android) — best. Excellent Hindi.
- ✅ **Edge** — same engine as Chrome. Works well.
- ✅ **Safari** on iPhone/Mac — works, though Hindi support is a bit weaker than Google's.
- ❌ **Firefox** — the Web Speech API is not enabled by default. Hindi does not work reliably.

That is why the README tells you to use Chrome/Edge/Safari.

---

## Privacy note

Your voice **does** go through Google's (or Apple's) speech server — that is unavoidable because that's who does the recognition. But:

- The audio is not permanently stored by those services (per their published policies).
- The audio does **not** touch Sunodukaan's servers because Sunodukaan has no servers.
- Only the resulting text is saved, and it's saved **only on your device** (see [How Storage Works](04-how-storage-works.md)).

If that trade-off is not acceptable for you, you would need to run a self-hosted speech-to-text engine (like Whisper on your own computer). That's more complex and outside the scope of a simple browser app.

---

**Next:** [2️⃣ How Understanding Works →](02-how-understanding-works.md) — the interesting part, where raw text becomes useful business insights.

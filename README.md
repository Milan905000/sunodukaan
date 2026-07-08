# Sunodukaan 🛒 — Voice Analytics for Your Shop

*Suno. Samjho. Bech lo.*

An **always-on listening app** for retailers. Point your phone or laptop mic at the counter, and at the end of the day it gives you:

- 🧾 **Products to reorder** — things customers asked for but you didn't have in stock
- 💸 **Lost sales analysis** — with reasons split into "my price too high" vs "cheaper elsewhere" vs "other"
- ✅ **Successful sales** with revenue captured
- 📊 A daily summary you can export as CSV / JSON

Works in **Hindi**, **English**, and **Hinglish** (mixed) — plus other Indian languages.

Runs 100% in your browser. No backend. No account. Your data stays on your device.

---

## 📚 Want to understand how it works?

Every part of the app is explained in plain English inside the [**`docs/`**](docs/) folder — start with [docs/README.md](docs/README.md).

- [How Listening Works](docs/01-how-listening-works.md) — mic + always-on trick
- [How Understanding Works](docs/02-how-understanding-works.md) — the extraction logic (⭐ most important)
- [How AI Mode Works](docs/03-how-ai-mode-works.md) — Claude integration
- [How Storage Works](docs/04-how-storage-works.md) — where your data lives
- [How the Summary Works](docs/05-how-summary-works.md) — reorder list, lost-sales math
- [How Hosting Works](docs/06-how-hosting-works.md) — GitHub Pages
- [Glossary](docs/07-glossary.md) — every technical word explained

---

## 🚀 Live app

Once GitHub Pages is enabled (see below), your app will be live at:

```
https://milan905000.github.io/sunodukaan/
```

---

## 📱 How to use

1. Open the URL above on your phone or laptop **in Chrome, Edge, or Safari**.
2. Tap **Start Listening** — the browser will ask for microphone permission. Say **Allow**.
3. Keep the app open near the shop counter. It will keep listening and auto-restart if it pauses.
4. At the end of the day, open the **📊 Summary** tab to see everything.
5. Tap **Export CSV / JSON** to save a copy.

### Tips

- Keep your phone/laptop plugged in — always-on listening drains battery.
- Chrome on Android or a laptop in the shop works well.
- If you speak in a mix of Hindi and English (Hinglish), keep the language set to **Hindi (India)**.
- If a customer interaction is missed, click **+ Add manually** and log it in a few seconds.
- Any interaction can be clicked to correct the product / outcome / price.

### Required: Add your Anthropic API key

Sunodukaan uses **Claude** to read your shop's conversations and classify each customer interaction. Without an API key, the app still records raw speech but cannot produce insights.

1. Get a key at [console.anthropic.com](https://console.anthropic.com) — sign-up is free, add a small amount of credit ($5 is plenty to start).
2. Paste it into **⚙️ Settings → Anthropic API Key**.
3. Tap **Test AI connection** — you should see ✅.
4. If you already used the app before adding the key, tap **Process pending transcripts** to classify everything captured so far.

Your key is stored only in your browser and only sent to Anthropic — nowhere else. Cost is roughly ₹0.10 per customer interaction; typical shops spend ₹150-600/month. See [docs/03-how-ai-mode-works.md](docs/03-how-ai-mode-works.md) for the full cost math.

---

## 🛠️ For the shopkeeper: What you need to do at your end

Everything is already pushed to your GitHub repo. **You only need to enable GitHub Pages once**, then the app is live.

### One-time setup (5 minutes)

1. Open **https://github.com/Milan905000/sunodukaan** in your browser.
2. Click **Settings** (top nav bar of the repo).
3. In the left sidebar, click **Pages**.
4. Under **Source**, choose **Deploy from a branch**.
5. Choose **Branch: `main`** and **Folder: `/ (root)`**. Click **Save**.
6. Wait ~1 minute. Refresh the Pages settings page — you'll see a green message with your URL (something like `https://milan905000.github.io/sunodukaan/`).
7. Open that URL. That's your app 🎉

**Alternative (already set up):** This repo also ships a GitHub Actions workflow at `.github/workflows/deploy.yml` that will auto-deploy on every push to `main` — you can enable it by switching **Source** to **GitHub Actions** in the Pages settings instead of "Deploy from a branch".

### Sharing with others

Just send them the URL. There's no login. Their data stays on their own device (each person keeps their own local data).

If you want everyone to see the same shop data, that would need a backend — outside the scope of the free GitHub Pages setup. Ask if you want that added later.

### If the mic doesn't work

- Make sure the URL starts with `https://` (GitHub Pages provides HTTPS automatically).
- Use **Chrome**, **Edge**, or **Safari**. Firefox has limited Hindi speech support.
- On iPhone, use **Safari**.
- Check that microphone permission is allowed for the site (browser settings).

### Editing / customizing the app

- `index.html` — the page structure
- `styles.css` — colors and layout
- `app.js` — all the logic (speech, extraction, storage, UI)

Push any change to `main` and GitHub Pages will pick it up within ~1 minute.

---

## 🧠 How the extraction works

Every 12 seconds of silence, the app takes the last chunk of speech and pulls out:

- **Product name** — matched from a built-in list of ~60 common Indian grocery / FMCG items (with Hindi, Hinglish, and English variants + big Indian brand names).
- **Outcome** — Sold, Lost (with reason), or Out-of-stock.
- **Price** — if mentioned (e.g. "45 rupaye").

If the AI mode is on, this same task is done by Claude Haiku which handles the nuance of real Hindi conversations much better.

---

## 🔒 Privacy

- Speech goes through your browser's speech engine (Google's on Chrome/Edge, Apple's on Safari).
- Everything else runs locally.
- Data lives in your browser's localStorage. Clear browser data = clear app data.
- Export regularly if you care about backups.
- If AI mode is on, the (short) transcript text is sent to Anthropic. Your API key never leaves your browser except in the API request to Anthropic itself.

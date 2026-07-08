# 📚 How Sunodukaan Works — Documentation

This folder explains, in plain English, how each part of the app works. Read them in order for a full picture, or jump to whichever one you're curious about.

| # | Document | What it explains |
|---|---|---|
| 1 | [How Listening Works](01-how-listening-works.md) | How the phone/laptop mic captures speech and converts it to text — including the always-on trick. |
| 2 | [How Understanding Works](02-how-understanding-works.md) | How the app reads the text and figures out **which product** was asked about and **what happened** (sold / lost / out-of-stock). This is the most important one. |
| 3 | [How AI Mode Works](03-how-ai-mode-works.md) | What changes when you enable Claude AI, and why it's more accurate. |
| 4 | [How Storage Works](04-how-storage-works.md) | Where your data lives and why it stays private. |
| 5 | [How the Summary Works](05-how-summary-works.md) | How raw interactions get turned into the daily reorder list and lost-sales breakdown. |
| 6 | [How Hosting Works](06-how-hosting-works.md) | How GitHub Pages serves the app to the world for free. |
| 7 | [Glossary](07-glossary.md) | Every technical word used in these docs, explained simply. |

## The 30-second version

```
Customer speaks
     ↓
Browser microphone captures audio
     ↓
Web Speech API (Google/Apple) turns audio → text
     ↓
App groups text into "conversation chunks" (12s of silence = new chunk)
     ↓
For each chunk, the app finds:
   • Which product was mentioned?
   • What was the outcome? (sold / lost / out-of-stock)
   • Why was it lost? (too expensive here / cheaper elsewhere / other)
     ↓
Save it to the browser's local storage
     ↓
Show it in the dashboard + summary
```

Everything happens on your device. There is no server (unless you turn on optional AI mode, in which case only short snippets of text go to Anthropic's Claude for smarter extraction).

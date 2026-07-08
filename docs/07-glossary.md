# 7️⃣ Glossary

*(All the technical words from the other docs, explained in plain English.)*

---

### API (Application Programming Interface)
A doorway one program uses to talk to another program. When Sunodukaan sends a chunk of text to Claude, it uses **Anthropic's API**. When your browser turns your voice into text, it uses the **Web Speech API**.

### API Key
A secret password that identifies *you* to an API. If you turn on AI Mode, you paste an Anthropic API key into Settings. Anthropic uses it to know which account should pay for the requests. Never share it publicly.

### Backend
A server that runs code somewhere far away. Sunodukaan has **no backend** — everything runs in your browser. That's why it's free to host and your data stays private.

### Browser
The app you use to open websites — Chrome, Safari, Edge, Firefox. For Sunodukaan you want Chrome, Edge, or Safari because Firefox doesn't support Hindi speech recognition well.

### CDN (Content Delivery Network)
A large network of servers spread around the world. When someone in Delhi opens a GitHub Pages site, GitHub's CDN serves it from a server near Delhi rather than from wherever GitHub's main servers are. That's why the app loads fast anywhere.

### Chunk
In this project, a "chunk" is one grouped batch of speech — everything spoken between two 12-second silences. Each chunk is treated as one customer conversation and processed together.

### Claude / Claude Haiku
Anthropic's family of AI models. **Claude Haiku 4.5** is the fastest and cheapest — Sunodukaan uses it in AI Mode.

### CSV (Comma-Separated Values)
A simple spreadsheet file where each row is a line of text and each column is separated by a comma. Excel and Google Sheets can open CSVs directly. Sunodukaan can export your day's interactions as CSV.

### Devanagari
The script used to write Hindi, Sanskrit, and several other Indian languages. E.g. `चीनी` (sugar). Sunodukaan's product dictionary contains Devanagari spellings so it can match speech directly transcribed in that script.

### DNS (Domain Name System)
The internet's phonebook. It converts a domain like `google.com` into the numeric address of the actual server. You only touch DNS if you attach a custom domain to your app.

### Extraction
The act of pulling structured information (product name, outcome, price) out of unstructured text (a spoken conversation). Sunodukaan does this exclusively by asking Claude (Anthropic's language model) to read each conversation chunk and return classified JSON.

### GitHub
A website where developers store code (in **repositories**). It also runs free hosting for simple sites via **GitHub Pages**.

### GitHub Actions
GitHub's built-in automation. You write a small script (a "workflow") describing what to do when certain events happen (like a push). Sunodukaan uses one to auto-deploy the site whenever `main` is updated.

### GitHub Pages
GitHub's free website hosting service. Point it at your repo and any HTML/CSS/JS files in there are served as a public website.

### Hinglish
Speech that mixes Hindi and English words freely — extremely common in Indian conversation. Example: *"Bhaiya sugar hai kya, 45 rupees mein de do."*

### HTTPS
The secure, encrypted version of HTTP (the language browsers speak). It's required for the microphone to work in modern browsers. GitHub Pages gives you HTTPS automatically.

### Interaction
In Sunodukaan-speak, one recorded customer-shopkeeper exchange about one product. Each interaction has an ID, a timestamp, a product, an outcome, an optional price, and a snippet.

### Interim result
A live preview of what the speech engine *thinks* you're saying, before it commits. Sunodukaan shows these in italics but doesn't save them.

### JSON (JavaScript Object Notation)
A universal way of writing structured data as plain text. It looks like nested `{ "key": "value" }` pairs. Sunodukaan uses JSON for storage, for exports, and for talking to Claude.

### LLM (Large Language Model)
An AI that can read and write human-language text. Claude is an LLM. GPT is another one. LLMs power AI Mode's extraction.

### localStorage
A small database that every website gets inside your browser. Sunodukaan stores all your data here. It's private — only Sunodukaan can read its own entries.

### Loop
Code that runs over and over. The listening-and-restarting cycle in Sunodukaan is a kind of loop: listen → transcribe → restart on silence → listen again.

### Model (AI model)
The specific "brain" being used. For AI Mode, the exact model is `claude-haiku-4-5-20251001`. You can think of a model as a specific person you're asking questions to — different models have different skills and prices.

### Outcome
The result of a customer interaction. Sunodukaan uses six outcomes: `sold`, `lost_expensive_here`, `lost_cheaper_elsewhere`, `lost_other`, `oos` (out of stock), `unclear`.

### Prompt
The text you give an AI model to instruct it. Sunodukaan sends Claude a **system prompt** (permanent instructions defining the task) and a **user message** (the actual conversation to process).

### Regex (Regular Expression)
A short cryptic pattern for finding text inside other text. Sunodukaan uses a regex to detect prices like "45 rupaye" or "₹45".

### Repository (repo)
A folder of files tracked by Git. Yours is `Milan905000/sunodukaan`.

### Pending Queue
When the app captures speech but cannot classify it (no API key set, network down, Anthropic API failure), the chunk of text is saved to a "pending" queue. A banner shows how many are queued, and clicking **Process now** replays them through Claude when the app is ready. Nothing is ever dropped.

### Schema
The exact shape a piece of data must have. Sunodukaan tells Claude the schema for extracted interactions so it always responds in the same predictable format.

### Server
A computer that other computers connect to. Sunodukaan has **no server of its own**. The Web Speech API uses Google/Apple's servers. AI Mode uses Anthropic's server. That's it.

### Snippet
The short chunk of spoken text (usually 1–3 sentences) that produced a given interaction. Stored so you can look back and verify what actually happened.

### SPA (Single Page Application)
A website where everything happens on one page — no reloads when you switch tabs or filter data. Sunodukaan is a small SPA.

### System Prompt
An instruction to an AI model that stays constant across a conversation. It tells the model who it is and how to behave. See [How AI Mode Works](03-how-ai-mode-works.md) for the exact system prompt Sunodukaan uses.

### Token
The unit AI models use for both reading and generating text — roughly ¾ of a word. Anthropic charges by tokens: so many rupees per million tokens. See the pricing section of doc #3.

### Toast
A small pop-up message that appears at the bottom of the screen for a couple of seconds. Sunodukaan uses toasts to tell you "Interaction saved" or "AI extraction failed — chunk queued for retry."

### Transcript
The stored history of what was spoken. Every finalized utterance is added to `state.transcript`. You can see today's transcript on the Live tab.

### Utterance
A single, finalized chunk of speech recognized as one unit — usually one sentence. Multiple utterances make up a chunk.

### Web Speech API
The browser feature that turns voice into text. Chrome/Edge send audio to Google's servers; Safari uses Apple's. Firefox's implementation is incomplete for many languages.

### Workflow (GitHub Actions)
A YAML script that describes automated steps for GitHub Actions to run. `.github/workflows/deploy.yml` is Sunodukaan's workflow.

### YAML
A human-friendly text format used mostly for config files (like GitHub Actions workflows). Uses indentation and colons instead of curly braces like JSON.

---

That's the whole vocabulary. If a word ever confuses you while reading the code or docs, come back here.

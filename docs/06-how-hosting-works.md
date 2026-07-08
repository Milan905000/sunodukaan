# 6️⃣ How Hosting Works

*(How the app gets from a folder of files on GitHub to a URL your customers — or you — can open on any phone in India, for free.)*

## The short version

Your code lives on **GitHub**. GitHub has a free service called **GitHub Pages** that will serve any HTML/CSS/JS files sitting in a repository as a real, live website. That's it. No server to buy, no hosting fees, no config file to write (well, almost none).

---

## What is GitHub Pages?

GitHub is primarily a code storage service. But it also runs a small feature where, if your repository contains a plain website (HTML + CSS + JS), it can host it publicly on the internet at a URL like:

```
https://<your-username>.github.io/<your-repo-name>/
```

For this project, that URL is:

```
https://milan905000.github.io/sunodukaan/
```

Anyone in the world can open that link and use the app. No sign-in required.

**Cost**: ₹0 for public repositories. Unlimited traffic, HTTPS included automatically.

---

## What GitHub Pages can and cannot do

✅ It **can** serve static files: HTML, CSS, JS, images, JSON, PDFs.
✅ It **can** handle any traffic — from 1 visitor to a million per day.
✅ It **provides HTTPS** automatically (the padlock icon), which is required for the microphone to work.
✅ It **updates automatically** every time you push new code.

❌ It **cannot** run server-side code (no Node.js, Python, PHP, databases).
❌ It **cannot** keep secrets — everything served is publicly downloadable.
❌ It **cannot** send emails or push notifications from itself.

For Sunodukaan, this is a perfect fit because *the entire app runs inside the browser*. There's nothing that needs a server.

---

## The two ways to deploy

GitHub Pages has two deployment modes. Sunodukaan supports both.

### Mode 1 — "Deploy from a branch" (simplest)

You tell GitHub: *"Whenever this branch has files, serve them as a website."*

- Go to **Settings → Pages** on your repo.
- Under **Source**, choose **Deploy from a branch**.
- Pick branch = **`main`**, folder = **`/ (root)`**.
- Save.

GitHub takes about a minute to publish, then you get a green message with your URL. Every time you `git push` to `main`, it re-publishes within ~60 seconds.

This is the easiest option and what most beginners choose.

### Mode 2 — "GitHub Actions" (what the repo currently uses)

You provide a small script — a **workflow** — that GitHub runs whenever you push. This is what's inside `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]     # trigger: any push to main
  workflow_dispatch:     # trigger: manual button in the UI

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4                    # download the code
      - uses: actions/configure-pages@v5             # set up Pages
      - uses: actions/upload-pages-artifact@v3       # bundle the site
        with:
          path: '.'
      - uses: actions/deploy-pages@v4                # publish it
```

What each line means:

- **`on: push: branches: [main]`** — "Run this workflow every time someone pushes to the `main` branch."
- **`workflow_dispatch`** — Also give me a manual "Run now" button on the GitHub website.
- **`runs-on: ubuntu-latest`** — Use a fresh Linux computer that GitHub provides for us for free.
- **`actions/checkout`** — Copy the code from the repo into that computer.
- **`actions/configure-pages`** — Get GitHub Pages ready.
- **`actions/upload-pages-artifact` with `path: '.'`** — Take *every* file in the repo (`.`) and package it up.
- **`actions/deploy-pages`** — Publish it to the live URL.

This method is a bit more flexible (you can add build steps, run tests, minify CSS, etc.). But for a plain-static site like this, both modes end up serving the same thing.

The repo ships this workflow ready to go, so you can just switch **Settings → Pages → Source** to **GitHub Actions** and it will use it.

---

## The Actions dashboard

Every time you push to `main`, you can watch the deployment happen:

1. Go to `https://github.com/Milan905000/sunodukaan/actions`.
2. You'll see a list of "workflow runs" — each corresponds to one push.
3. Click one to see the steps.
4. A green tick ✅ means the site is live. A red X ❌ means something broke; open the failed step to see the error.

For a static site like this, deployments almost never fail. If one does, it's usually a temporary GitHub issue and clicking **Re-run job** fixes it.

---

## How the URL becomes live

When GitHub Pages publishes:

1. It uploads your files to GitHub's own **content delivery network** (CDN) — a network of servers around the world, so users load the site from the one nearest to them.
2. It configures the URL `https://milan905000.github.io/sunodukaan/` to point to those files.
3. It gets an SSL certificate automatically (that's the `https://` and the padlock).
4. Within about 60 seconds, the URL starts responding to visitors.

When your customer (or you) opens the URL:

```
Their phone browser  ──HTTPS──▶  GitHub CDN
                     ◀── HTML ──
                     ── request ▶ (loads styles.css, app.js, favicon)
                     ◀── files ──
```

That's it. From there, everything happens in their browser. There's no ongoing "connection" back to GitHub — once the files are downloaded, the app just runs.

---

## What if you want a custom domain?

Right now the URL is `milan905000.github.io/sunodukaan`. If you want something friendlier like `sunodukaan.com` or `mydukaan.shop`:

1. Buy a domain from any registrar (GoDaddy, Namecheap, Google Domains, etc.). About ₹800/year.
2. In **Settings → Pages → Custom domain**, type your domain.
3. In your domain registrar's DNS settings, add a CNAME record pointing to `milan905000.github.io`.
4. Wait for DNS to propagate (up to 24 hours, usually ~15 minutes).
5. GitHub will get an SSL certificate for your custom domain automatically.

This is optional and you don't need it for the app to work.

---

## Making changes to the live site

The workflow is:

```
Edit a file locally (or on GitHub.com's web editor)
    ↓
git commit
    ↓
git push origin main
    ↓
GitHub Actions runs automatically (~30-60 sec)
    ↓
Live site updates
```

Users who already have the app open in their browser might need to hit **refresh** to get the new version. That's because the browser caches files.

---

## Free-tier limits

For a personal shop app, you will never hit these, but for completeness:

- **1 GB storage** for the repository (your code).
- **100 GB bandwidth per month** (data served to visitors).
- **10 builds per hour** for GitHub Actions.
- Sites become **inactive after 100 days** without any pushes — a single dummy commit resets that.

If your grocery shop goes viral, congratulations — you can upgrade to a paid GitHub plan or switch to a service like Netlify / Cloudflare Pages (also free) that has higher limits.

---

## Why this setup is so nice for a shopkeeper

- ✅ **Zero cost** — no monthly bill.
- ✅ **Zero maintenance** — no server to update or restart.
- ✅ **Fast** — GitHub's CDN serves the app from a server near your users.
- ✅ **Reliable** — GitHub is used by millions of developers; uptime is very high.
- ✅ **Portable** — if you ever want to move off GitHub, just download the four files (`index.html`, `styles.css`, `app.js`, `README.md`) and host them anywhere.

---

**Next:** [7️⃣ Glossary →](07-glossary.md) — the technical vocabulary used in these docs, explained simply.

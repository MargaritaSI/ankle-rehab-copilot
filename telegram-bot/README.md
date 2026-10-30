# Rehab Copilot — Telegram companion bot

The Telegram side of Rehab Copilot. **The web app thinks, the bot keeps time and habit.**
Evidence questions are answered on the website (with citations, phase context and the
citation guard); the bot never calls a model. It only does what a website can't:

- **`/leg`** — 10 short rule cards (swelling rule, red flags, frequency over intensity,
  gentle ankle moves, breathing, after-load care…) and a link to the site with the
  question pre-filled (`?q=`).
- **Evening leg diary** — "How is the leg today, 1–5" + "had swelling" buttons; `/diary`
  shows 7 days; a Sunday weekly summary; after a bad day the morning push says
  "step the load back one notch, not to zero".
- **`/walk`** — walk timer: a nudge at ~90 min ("better stop now than recover for two
  days"), auto-stop at 4 h, minutes go to the diary.
- **Micro-movement reminders** — ≤1-minute exercises picked by situation, filtered by a
  protocol safety list (no calf raises, single-leg balance, bands or jumps at this stage).
- **Group windows** — `/here` in a group: shared practice windows at 09:00 and 20:00
  (Europe/Amsterdam) with "I'm in / Done" buttons, a tally, a weekly count. No chat, no
  rankings — productive "together".
- **`/plate`** anti-inflammatory plate of the day, **`/breathe`** one-minute breathing.

## Stack

TypeScript · Cloudflare Workers (free plan) · D1 · cron every 15 min.
A per-tick budget keeps one cron invocation under the free plan's 50-subrequest limit
(≤45 subrequests, ≤35 sends; groups first). See `docs/LIMITS.md`.
Long messages are split under Telegram's 4096-char limit, 429 is retried once,
every Telegram call has an 8 s timeout. 161 tests (`npm test`).

The original RAG answerer (`src/leg_rag.ts`, Workers AI embeddings + strict grounding,
personal chunks only for the owner) is kept in the code but no longer wired to `/leg` —
answers moved to the website so there is one source of reasoning.

## Note

This folder is a **snapshot** for reading. The live bot is deployed from a private
monorepo; secrets (bot token, webhook secret) live in Cloudflare and are not in the code.
To run your own copy: `npm install`, create a D1 database and put its id into
`wrangler.toml`, `wrangler secret put TELEGRAM_BOT_TOKEN` / `WEBHOOK_SECRET`,
`npm run migrate:remote`, `npm run deploy`, then set the Telegram webhook.

Developer notes (Russian): `README.dev.md`.

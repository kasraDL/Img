# Immigration / Position-Finder Telegram Bot

A Telegram bot on **Cloudflare Workers** that helps students find academic positions from a CV, score matches, prepare application drafts, track applications, and generate Excel reports.

## Release status

The repository has been audited and the main security blocker identified in the callback flow has been fixed. **The code is ready for runtime validation, not yet for blind production deployment.** Run the checks in `AUDIT.md` before publishing.

## Stack

- Cloudflare Workers + Hono
- D1 for student, CV, search, position, and application data
- R2 for uploaded CV PDFs
- KV for short-lived conversation state
- Workers AI (`@cf/openai/gpt-oss-120b`)
- Brave Search API with Bing RSS fallback
- SheetJS (`xlsx`) for Excel reports
- Cron Triggers for 10-day follow-up reminders
- Telegram Bot API

## Cloudflare setup

Create the D1, R2, and KV resources referenced by `wrangler.toml`, then configure these secrets:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
# optional
wrangler secret put BRAVE_SEARCH_API_KEY
```

Initialize a fresh database with:

```bash
npm ci
npm run db:init:remote
```

For an existing deployment, apply each migration that has not already been applied:

```bash
npm run db:migrate:language
npm run db:migrate:applications
```

Validate and deploy:

```bash
npm run check
npx wrangler deploy --dry-run
npm run deploy
```

After deployment, register the Telegram webhook once by visiting `/setup` on the Worker URL.

## Workers AI quota

`@cf/openai/gpt-oss-120b` is an active Workers AI model. Workers AI currently includes a **10,000-neuron/day free allocation**; matching many listings individually can consume that allowance quickly. Monitor usage and use a paid plan or a lower-cost model if the bot will serve multiple students.

## Security model

- Telegram webhook requests are checked with `TELEGRAM_WEBHOOK_SECRET`.
- Callback position/application IDs are verified against the Telegram chat before actions are executed.
- Telegram tokens, webhook secrets, and search API keys belong in Wrangler secrets, not Git.
- CV PDFs are stored in R2 and extracted profiles in D1.
- Generated emails are opened through `mailto:` so the student reviews and sends them manually.

## Main commands

- `/start` — upload/select a CV and start a search
- `/newsearch` — search again using the latest CV
- `/positions` — latest matched positions
- `/saved` — shortlisted positions
- `/applied` — applied positions
- `/report` — Excel application tracker
- `/addchannel` — monitor a public Telegram channel
- `/addlinkedin` — save a LinkedIn source for manual checking
- `/sources` — list monitored sources
- `/language` — switch English/Persian
- `/help` — show available commands

See `AUDIT.md` for the validation checklist.

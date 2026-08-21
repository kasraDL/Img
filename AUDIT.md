# Audit status

## Production hardening completed

- **Cross-user callback authorization:** fixed at the webhook boundary. Position and application callback IDs are now checked against `cb.message.chat.id` before the legacy dispatcher can read or mutate them.
- **Telegram document sends:** `/report` and other document sends now validate Telegram's JSON `{ok:false}` response even when HTTP status is 200.
- **Workers compatibility date:** updated to `2026-08-21`, matching current Cloudflare guidance.
- **Webhook secret check:** rejects missing or mismatched Telegram secret headers.
- **Markdown delivery:** Telegram text sends retry as plain text when Telegram rejects malformed Markdown entities.
- **Application detail provenance:** failed page extraction remains retryable instead of being permanently recorded as a successful page extraction.
- **Mailto encoding:** uses percent encoding compatible with `mailto:` rather than form-style `+` spaces.
- **Excel export:** mitigates spreadsheet formula injection for externally sourced text.
- **Search latency:** source-site searches run in parallel.
- **Workers AI response parsing:** reads the current binding's `response` field first, with a compatibility fallback.

## Remaining validation

The repository has not been executed in a real Node/Cloudflare runtime from this environment because the runtime could not resolve `github.com` for a local clone. Before the actual production deploy, run:

```bash
npm ci
npm run check
npx wrangler deploy --dry-run
```

Then test at least:

1. `/start` and PDF CV upload.
2. AI profile extraction.
3. A PhD search with and without `BRAVE_SEARCH_API_KEY`.
4. Save/dismiss/applied callbacks.
5. Letter/email generation.
6. `/report` Excel download.
7. The 10-day reminder cron path.
8. An unauthorized callback ID from another chat must be rejected.

## Workers AI quota

`@cf/openai/gpt-oss-120b` is currently an active Workers AI model. Workers AI currently includes a 10,000-neuron/day free allocation. High-volume per-listing matching can consume that quota quickly, so production usage should be monitored and capped or moved to a paid plan as required.

## Database

For a fresh database, run `npm run db:init:remote`. For an existing deployment, apply each migration that has not already been applied:

```bash
npm run db:migrate:language
npm run db:migrate:applications
```

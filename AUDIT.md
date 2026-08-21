# Audit status

## Fourth pass — production hardening

- **Cross-user callback authorization is now a release blocker.** Position and application callback IDs are currently accepted without verifying that the referenced row belongs to the Telegram chat that pressed the button. A guessed ID could therefore mutate another student's shortlist/application state and, for document generation, potentially expose another student's CV-derived content. This must be fixed before public production use by binding every action to the authenticated callback chat ID.
- **Telegram document sends now validate the API JSON response**, not only the HTTP status. Telegram can return HTTP 200 with `{ok:false}`; `/report` and other document sends must treat that as a failure.
- **Workers compatibility date should track the current runtime.** The project now uses the current 2026-08-21 compatibility date. Cloudflare recommends keeping this current for new runtime behavior and fixes.

## Third pass — confirmed bugs fixed

- **`details_source` was always hardcoded to `"page"`** in `generateAndSendDocument`, even when `extractPositionDetails()` genuinely found nothing. Fixed by writing `result.source` through instead of a literal `"page"`.
- **Callback errors now get acknowledged.** The callback dispatcher is wrapped so unexpected DB/AI/network failures do not leave Telegram's button spinner stuck indefinitely.
- **`buildMailtoLink` now uses RFC-compatible percent encoding** instead of form encoding that turns spaces into `+`.
- **Excel formula injection is mitigated** by prefixing dangerous spreadsheet-cell values with `'`.

## Second pass — confirmed bugs fixed

- **Brave Search API key is wired through** from the Worker environment.
- **Telegram Markdown parse failures fall back to plain text** at the client layer.
- **Position searches run in parallel per source site** instead of serially.

## Confirmed critical issue fixed

`workersAI.ts` reads `response` from the native Workers AI binding first, with `choices[0].message.content` retained as a compatibility fallback. Cloudflare's current gpt-oss binding documents `response` as the synchronous output field.

## Current production blockers

1. **Fix callback ownership before publishing publicly.** Do not deploy the current `main` revision to a multi-user production bot until position/application actions verify ownership against `cb.message.chat.id`.
2. Run `npm ci`, `npm run check`, and `npx wrangler deploy --dry-run` in a real Node/Cloudflare environment. The current execution environment cannot reach GitHub to clone the repository, so those commands have not been executed here.
3. Run the existing D1 migrations on the deployed database if they have not already been applied.

## Cloudflare notes

The configured model `@cf/openai/gpt-oss-120b` is currently listed by Cloudflare as an active Workers AI model. Workers AI has a 10,000-neuron/day free allocation; high-volume matching can exhaust that quota quickly, so production traffic should be monitored and capped or moved to a paid plan as needed.

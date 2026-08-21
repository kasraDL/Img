# Audit status

## Second pass — confirmed bugs fixed

- **Brave Search API key wiring:** the optional `BRAVE_SEARCH_API_KEY` binding is passed from the Worker handler into the search layer.
- **Telegram Markdown fallback:** text-send methods retry as plain text when Telegram rejects unescaped Markdown entities.
- **Parallel multi-site search:** curated site searches run concurrently with `Promise.all`.


## Confirmed critical issue fixed

`src/services/workersAI.ts` was reading `choices[0].message.content` from the native Workers AI binding. The current `@cf/openai/gpt-oss-120b` Workers AI binding returns the generated text in `response`. This caused CV extraction, position scoring, motivation letters, application emails, and follow-up emails to receive an empty string.

The implementation now reads `response` first and keeps `choices` as a compatibility fallback.

## Reliability improvements

- Position matching is limited to four concurrent Workers AI calls instead of running every request sequentially.
- AI token budgets are smaller for scoring and follow-up generation.
- CV JSON parsing has a repair attempt and safe fallback.
- `npm run typecheck` / `npm run check` were added.
- GitHub Actions now runs TypeScript validation on pushes and pull requests.
- Database migration commands were added to `package.json` for the existing language and applications migrations.

## Validation

Run locally:

```bash
npm ci
npm run check
npx wrangler deploy --dry-run
```

For an already-deployed D1 database, run the required migrations before using the application tracker.

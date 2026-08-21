# Audit status

## Third pass — confirmed bugs fixed

- **`details_source` was always hardcoded to `"page"`** in
  `generateAndSendDocument`, even when `extractPositionDetails()` genuinely
  found nothing (page unreachable, or only a weak fallback snippet was
  available, in which case it correctly returns `source: null`). Because the
  code gates re-extraction on `details_source === null`, a single failed
  attempt was being permanently recorded as a successful one — the position
  would never be re-scraped later even if the site came back up. Fixed by
  writing `result.source` through instead of a literal `"page"`, and widened
  `updateApplicationDetails`'s type to accept `null`.
- **`handleCallbackQuery`'s ~1,300-line dispatcher had zero try/catch
  blocks.** Any DB/AI/network error partway through a button tap (any of the
  ~30 branches) left the tapped button's loading spinner stuck forever, since
  Telegram only clears it once `answerCallbackQuery` is called — with no
  feedback to the student and no way to know something went wrong. Wrapped
  the whole handler so every path now acknowledges the callback, including
  the unexpected-error one (with a visible "something went wrong" alert).
- **`buildMailtoLink` used `URLSearchParams`, which encodes spaces as `+`.**
  That's the `application/x-www-form-urlencoded` convention, but `mailto:`
  links follow RFC 6068, where `+` is a literal character. Several mail
  clients don't convert it back to a space, so every generated draft would
  show literal `+` signs instead of spaces in the subject/body. Switched to
  manual `encodeURIComponent` per field, which correctly emits `%20`.
- **Excel/CSV formula injection in `/report`.** Several exported columns
  (funding info, professor name, position title, listing URL) come from AI
  extraction off scraped pages we don't control. If any of that text happened
  to start with `=`, `+`, `-`, or `@`, Excel/Sheets/LibreOffice would
  interpret the cell as a formula when the student opened the report — a
  known CSV/XLSX injection class. Added a `sanitizeCell()` helper that
  prefixes such values with a leading `'` so they always render as plain
  text.

## Second pass — confirmed bugs fixed

- **Brave Search API key was never wired up.** `Env.BRAVE_SEARCH_API_KEY` existed
  and `searchPositions()` accepted it, but the only call site in
  `src/handlers/webhook.ts` called `searchPositions(degreeLevel, fieldHint,
  countryHint)` — no key argument. Every search silently ran the unofficial Bing
  RSS fallback, regardless of whether a key was configured. Fixed by passing
  `env.BRAVE_SEARCH_API_KEY` through. `wrangler.toml` and `README.md` also still
  described the old DuckDuckGo scraping (removed in an earlier commit) instead
  of Brave/Bing — updated both.
- **Any Telegram `sendMessage`/`editMessageText` call could silently fail** if
  the text (CV summaries, position titles, scraped snippets, professor names -
  none of it under our control) contained an unescaped Markdown character like
  `_` or `*`. Telegram's legacy `Markdown` parse mode rejects the whole request
  in that case, and the failure wasn't caught anywhere specific: in
  `handleCvUpload` it surfaced as "couldn't read your CV" even when the CV read
  fine, and in the daily reminder sweep it silently dropped the follow-up
  (without marking it notified, so it would keep failing). `TelegramClient` now
  retries once as plain text whenever Telegram reports a parse-entities error,
  so the message still reaches the student. This is a single fix at the client
  level, covering all ~60 call sites in `webhook.ts` and `scheduled.ts`.
- **Position search ran fully sequentially** — up to 7 sites for a PhD search,
  each up to 3 query variants x 2 providers if nothing matched, all one after
  another. `searchPositions()` now fires all sites in parallel with
  `Promise.all`, which meaningfully cuts webhook response latency and reduces
  the chance of Telegram retrying (and duplicate-processing) a webhook it
  thinks was dropped.

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

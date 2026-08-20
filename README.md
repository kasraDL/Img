# Immigration / Position-Finder Telegram Bot (Free-Tier Version)

A Telegram bot on **Cloudflare Workers** that:

1. Asks the student to upload their **CV as a PDF**
2. Extracts text from the PDF and uses **Cloudflare Workers AI** (free) to build a
   structured background profile, saved as history in D1
3. Asks which level they're applying for — **Bachelor / Master / PhD**
4. Asks for a field/research hint and an optional country preference
5. Searches known academic position sites (FindAPhD, EURAXESS, AcademicPositions,
   FindAMasters, etc.) via a **free DuckDuckGo HTML search** (no API key), plus
   any Telegram channels or LinkedIn pages you register
6. Scores every result against the student's profile with Workers AI and returns
   tap-to-act result cards (📄 Letter, ✉️ Email, ⭐ Save, ✅ Applied, 🚫 Dismiss)
7. For each application, looks up the professor's contact info from the real
   listing page, drafts a tailored motivation letter and email, and prepares a
   one-tap send link — then follows up automatically every 10 days if there's
   no reply
8. Tracks everything in a proper `applications` table and exports it to a real
   Excel file on request via `/report`

## What makes this version $0

| Piece | Service | Cost at hobby-project volume |
|---|---|---|
| Hosting | Cloudflare Workers | Free (100k requests/day) |
| Student/CV/search/application history | Cloudflare D1 | Free (5GB storage, 5M row reads/day) |
| CV PDF storage | Cloudflare R2 | Free (10GB storage) |
| Conversation state | Cloudflare KV | Free (100k reads/day) |
| CV parsing, match scoring, letter/email drafting | **Cloudflare Workers AI** | Free **daily quota** (resets every day) |
| Position search | **DuckDuckGo HTML scrape** | Free, no key — but unofficial (see caveat below) |
| Excel export | **SheetJS**, generated in-Worker | Free, no external service |
| 10-day reminder sweep | Cloudflare **Cron Triggers** | Free |
| Sending the actual email | Student's own mail app (`mailto:`) | Free, and no API/domain setup needed |
| Messaging | Telegram Bot API | Always free |

No credit card, no external API keys beyond your Telegram bot token, and nothing
in this stack bills you unless you go past Cloudflare's daily free allowances.

### Two honest caveats

- **Workers AI's free tier is a daily quota**, not unlimited forever. Fine for
  testing and light real usage; if the bot gets heavy traffic, Cloudflare will
  eventually bill for extra Workers AI usage past the daily allowance.
- **DuckDuckGo search has no official API** — `src/services/search.ts` scrapes
  its plain HTML results page, which works today but isn't guaranteed to keep
  working if DuckDuckGo changes its markup or rate-limits the requests. If it
  stops working, the bot falls back to just handing the student direct search
  links. If you outgrow this, Google's Programmable Search Engine gives 100
  free queries/day with just a Google account (no cost) and is a more stable
  swap-in — see the comment at the top of `search.ts`.

## Stack

- **Cloudflare Workers** + **Hono** (routing)
- **D1** — students, CV history, search history, matched positions, applications tracker
- **R2** — stores the raw CV PDFs
- **KV** — short-lived conversation state (which step each chat is on)
- **Workers AI** (`@cf/meta/llama-3.1-8b-instruct`) — CV parsing, match scoring,
  letter/email drafting, listing-page detail extraction
- **DuckDuckGo HTML search** — free position search across curated sites
- **SheetJS (`xlsx`)** — builds the `/report` Excel file in-Worker, no external service
- **Cloudflare Cron Triggers** — daily 10-day follow-up reminder sweep

## 1. Prerequisites

- A Cloudflare account (free)
- Node.js 18+ and `npm i -g wrangler` (or use `npx wrangler`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather) (`/newbot`)

That's it — no Anthropic key, no SerpAPI key.

## 2. Install dependencies

```bash
cd immigration-bot
npm install
```

## 3. Create the Cloudflare resources

```bash
# D1 database
wrangler d1 create immigration_bot_db
# -> copy the returned database_id into wrangler.toml under [[d1_databases]]

# R2 bucket
wrangler r2 bucket create immigration-bot-cvs

# KV namespace
wrangler kv namespace create SESSIONS
# -> copy the returned id into wrangler.toml under [[kv_namespaces]]
```

Workers AI needs no setup beyond the `[ai]` binding already in `wrangler.toml` —
it activates automatically on your Cloudflare account.

Then load the schema:

```bash
npm run db:init:remote
```

## 4. Set secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string you make up yourself
```

## 5. Deploy

```bash
npm run deploy
```

Wrangler prints your Worker URL, e.g. `https://immigration-position-bot.YOU.workers.dev`.

(If you'd rather deploy through the dashboard: **Workers & Pages → Create application →
Workers → "Import repo" or "Deploy from CLI"**, point it at this folder, and add the same
bindings/secrets in **Settings → Variables and Secrets**.)

## 6. Register the webhook

Visit, once, in a browser:

```
https://YOUR-WORKER-URL/setup
```

This tells Telegram to POST every update to `/webhook`, verified with your
`TELEGRAM_WEBHOOK_SECRET`, and also registers the bot's command menu (the
"/" button in Telegram) so students can see everything it can do. You should
get back `{"ok": true, ...}` in the response.

### If you already had this bot deployed before

Run the one-time migrations for what's changed since your last deploy (skip
whichever you've already run; both are safe no-ops on a fresh database since
they're already folded into `schema.sql`):

```bash
wrangler d1 execute immigration_bot_db --remote --file=./src/db/migrations/0002_add_language.sql
wrangler d1 execute immigration_bot_db --remote --file=./src/db/migrations/0003_add_applications.sql
```

## 7. Try it

Open your bot in Telegram, send `/start`, then upload a CV as a PDF and follow
the prompts.

## If you later want higher quality (and are OK paying a little)

Two easy upgrades, each independent of the other:

- **Better AI**: swap `MODEL` in `src/services/workersAI.ts` for a bigger Workers
  AI model (still on Cloudflare, still no separate account, just a higher free-quota
  burn rate — e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`), or switch the
  `callWorkersAI` calls to a real Anthropic Claude API call (a few dollars a month
  at light volume) for meaningfully better CV parsing and letter quality.
- **Better search**: swap DuckDuckGo scraping in `src/services/search.ts` for
  Google's Programmable Search Engine (100 free queries/day) or a paid API like
  SerpAPI for more reliable, higher-volume results.

## What's new: a friendlier, more capable bot

All still $0. The core flow is the same, but interacting with it is now much
less "type a command" and much more "tap a button":

- **Tap-to-act result cards.** Every matched position is its own card with
  buttons: 📄 Letter, ✉️ Email, ⭐ Save, ✅ Applied, 🚫 Dismiss. No more typing
  `letter 3` (though that still works too, as a fallback).
- **Application tracking.** ⭐ Save and ✅ Applied actually persist —
  `/saved` shows your shortlist, `/applied` shows what you've applied to.
  Dismissing a card clears its buttons so old noise doesn't linger.
- **Bilingual (English/Persian).** The bot auto-detects the student's
  Telegram language and replies in Persian if their client is set to Farsi,
  English otherwise. `/language` switches manually anytime, with a tap.
  Only the bot's own chat messages are translated — motivation letters and
  emails are always drafted in English, since that's what applications
  actually need regardless of the student's own language.
- **A real command menu.** After running `/setup` once, students see all
  commands in Telegram's "/" menu instead of having to guess them.
- **`/help`** lists everything, in whichever language is active.

## Application tracking, Excel reports, and 10-day follow-up reminders

The moment you generate a 📄 Letter or ✉️ Email for a position, the bot creates
an `applications` row for it and keeps it updated from there — this is what
`/report` exports and what the reminder cron reads.

**Contact-detail lookup.** Before drafting, the bot fetches the actual listing
page and asks Workers AI to pull out the professor's name/email, university,
country, and funding info — instructed explicitly to leave a field blank
rather than guess it (`src/services/positionDetails.ts`). If no email is
found (many listings are apply-via-portal only), it asks you once; reply with
an address or "skip". This only happens once per position, not on every tap.

**`/report`** builds a real `.xlsx` file on the spot (via SheetJS — no Google
account, no external API) with one row per application: position, university,
country, field, professor name/email, funding, status, when it was sent, how
many follow-ups you've sent, and the listing URL — and sends it to you as a
Telegram document.

**Sending — one tap, from your own inbox, not automatic.** After a draft is
ready, you get an *"📤 Open to Send"* button that opens your own mail app with
the email pre-filled, and *"✔️ Mark as Sent"* to log it. This is deliberate,
not a limitation I ran out of time on:
- The free AI model can misfire on a name or a CV detail. An email that reads
  as automated *and* has an error in it, sent under your name, is worse than
  no automation on that last step.
- It goes out from your real address, which reads as genuine to a professor
  rather than bulk mail from a third-party sending service.
- A true zero-tap auto-send would need a paid (or domain-verified) email API
  — see the note in `src/services/mailto.ts` if you want to add one later.

**10-day reminders, fully automatic.** A Cloudflare Cron Trigger
(`src/handlers/scheduled.ts`, configured in `wrangler.toml`) runs daily and
checks every application marked "sent" across every student. Once 10 days
have passed with no reply logged, it messages you a follow-up draft with the
same one-tap send button — no need to have the bot open, and it re-checks
every 10 days after that until you mark the position replied/rejected/etc.

## Extra sources: Telegram channels and LinkedIn pages

Beyond the built-in site search, a student can register their own sources with
bot commands (handled in `src/handlers/webhook.ts`, stored in the
`monitored_sources` D1 table):

- `/addchannel channelusername` — a **public** Telegram channel. Checked
  automatically on every search, for free, by fetching the channel's public
  `t.me/s/<channel>` preview page (no bot-admin rights needed). See
  `src/services/telegramChannels.ts`.
- `/addlinkedin page-name-or-url` — saved for reference only. **There is no
  free, official way to auto-check a LinkedIn page's posts** (no public API
  for this, no RSS anymore, and scraping LinkedIn directly is against its
  Terms of Service, so this project doesn't do it). Instead, the bot reminds
  the student to check it manually on every search.
- `/sources` — list what's registered; `/removesource ID` — remove one.
- Anyone can also just **paste a listing's text** (from LinkedIn or anywhere)
  directly into the chat — the bot scores it against the CV and offers
  `letter 1` / `email 1` for it, same as an auto-found result.

## Extending it further

- **More/better sources**: edit `SITES_BY_DEGREE` in `src/services/search.ts`.
- **Scanned/image CVs**: this only extracts embedded PDF text. For scanned PDFs
  you'd need an OCR step first (Workers AI also has vision models you could
  point at rendered page images).
- **Multi-CV history**: the schema already keeps every CV upload as its own row
  in `cv_history`, so a student re-uploading an updated CV just adds a new
  version — nothing needs to change.
- **Status lifecycle beyond "sent"**: `applications.application_status` supports
  `replied` / `rejected` / `accepted` / `withdrawn`, but nothing sets those yet —
  add a `/status` command or extra card buttons if you want to log them from chat.

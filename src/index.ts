import { Hono } from "hono";
import type { Env } from "./types";
import { handleUpdate } from "./handlers/webhook";
import { runReminderSweep } from "./handlers/scheduled";
import { TelegramClient } from "./services/telegramApi";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("Immigration position bot is running."));

// Telegram calls this on every update. We verify the request really came
// from Telegram using the secret token header (set via /setup below).
app.post("/webhook", async (c) => {
  const secretHeader = c.req.header("x-telegram-bot-api-secret-token");
  if (secretHeader !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text("forbidden", 403);
  }

  const update = await c.req.json();
  // Cloudflare gives Workers ~30s of post-response execution via waitUntil,
  // but doing the work inline keeps this simple and errors visible in `wrangler tail`.
  try {
    await handleUpdate(update, c.env);
  } catch (err) {
    console.error("handleUpdate failed:", err);
  }
  return c.text("ok");
});

// Visit this once after deploying (from a browser, logged in isn't needed -
// it just needs to hit your own Worker URL) to register the webhook with Telegram.
// e.g. https://your-worker.your-subdomain.workers.dev/setup
app.get("/setup", async (c) => {
  const tg = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);
  const workerUrl = new URL(c.req.url);
  const webhookUrl = `${workerUrl.origin}/webhook`;
  const webhookResult = await tg.setWebhook(webhookUrl, c.env.TELEGRAM_WEBHOOK_SECRET);

  // Populates the "/" menu button in Telegram's UI so students can see what's available.
  const commandsResult = await tg.setMyCommands([
    { command: "start", description: "Begin / upload a new CV" },
    { command: "newsearch", description: "Search again with your CV on file" },
    { command: "positions", description: "Show your latest results" },
    { command: "saved", description: "Positions you've shortlisted" },
    { command: "applied", description: "Positions you've applied to" },
    { command: "report", description: "Download your applications tracker (Excel)" },
    { command: "addchannel", description: "Auto-check a public Telegram channel" },
    { command: "addlinkedin", description: "Save a LinkedIn page as a manual reminder" },
    { command: "sources", description: "List your extra sources" },
    { command: "language", description: "Switch between English and Persian" },
    { command: "help", description: "Show everything I can do" },
  ]);

  return c.json({ webhookUrl, webhookResult, commandsResult });
});

export default {
  fetch: app.fetch,
  // Daily Cron Trigger (see wrangler.toml) - checks for 10-day-old
  // applications with no reply and pings the student with a follow-up draft.
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runReminderSweep(env));
  },
};

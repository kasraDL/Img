import { Hono } from "hono";
import type { Env } from "./types";
import { handleSecureUpdate } from "./handlers/secureWebhook";
import { runReminderSweep } from "./handlers/scheduled";
import { TelegramClient } from "./services/telegramApi";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("Immigration position bot is running."));

app.post("/webhook", async (c) => {
  const secretHeader = c.req.header("x-telegram-bot-api-secret-token");
  if (!secretHeader || secretHeader !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text("forbidden", 403);
  }

  try {
    const update = await c.req.json();
    await handleSecureUpdate(update, c.env);
  } catch (err) {
    console.error("Webhook handling failed:", err);
  }

  return c.text("ok");
});

app.get("/setup", async (c) => {
  const tg = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);
  const workerUrl = new URL(c.req.url);
  const webhookUrl = `${workerUrl.origin}/webhook`;
  const webhookResult = await tg.setWebhook(webhookUrl, c.env.TELEGRAM_WEBHOOK_SECRET);

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
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runReminderSweep(env));
  },
};

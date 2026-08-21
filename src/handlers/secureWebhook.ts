import { handleUpdate } from "./webhook";
import { TelegramClient } from "../services/telegramApi";
import type { Env } from "../types";
import { getMatchedPositionWithContext, getApplicationById } from "../db/queries";

interface CallbackUpdate {
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id?: number } };
  };
}

const POSITION_ACTIONS = /^(?:letter|email|save|dismiss|applied):(\d+)$/;
const APPLICATION_ACTIONS = /^(?:marksent|followupsent):(\d+)$/;

/**
 * Authorization boundary for callback buttons.
 *
 * Telegram callback_data is client-controlled. The numeric IDs embedded in
 * buttons must therefore never be treated as authorization. Before the legacy
 * dispatcher is allowed to run, verify that position/application rows belong
 * to the chat that pressed the button.
 */
export async function handleSecureUpdate(update: unknown, env: Env): Promise<void> {
  const callback = (update as CallbackUpdate | null)?.callback_query;
  if (!callback) {
    await handleUpdate(update as Parameters<typeof handleUpdate>[0], env);
    return;
  }

  const chatId = callback.message?.chat?.id;
  const data = callback.data ?? "";
  const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

  if (!chatId) {
    await tg.answerCallbackQuery(callback.id, "Invalid callback.", true);
    return;
  }

  const positionMatch = data.match(POSITION_ACTIONS);
  if (positionMatch) {
    const positionId = Number(positionMatch[1]);
    const context = await getMatchedPositionWithContext(env.DB, positionId);

    if (!context || context.chat_id !== chatId) {
      await tg.answerCallbackQuery(callback.id, "This action is not available for your account.", true);
      return;
    }
  }

  const applicationMatch = data.match(APPLICATION_ACTIONS);
  if (applicationMatch) {
    const applicationId = Number(applicationMatch[1]);
    const application = await getApplicationById(env.DB, applicationId);

    if (!application || application.chat_id !== chatId) {
      await tg.answerCallbackQuery(callback.id, "This action is not available for your account.", true);
      return;
    }
  }

  await handleUpdate(update as Parameters<typeof handleUpdate>[0], env);
}

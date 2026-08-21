const API_BASE = "https://api.telegram.org/bot";

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly description: string,
    public readonly payload: unknown
  ) {
    super(`Telegram API error on ${method}: ${description}`);
    this.name = "TelegramApiError";
  }
}

function isEntityParseError(error: unknown): boolean {
  return error instanceof TelegramApiError && /can't parse entities/i.test(error.description);
}

export class TelegramClient {
  private base: string;

  constructor(private token: string) {
    this.base = `${API_BASE}${token}`;
  }

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || (data as { ok?: boolean }).ok === false) {
      const description = (data as { description?: string })?.description ?? JSON.stringify(data);
      throw new TelegramApiError(method, description, data);
    }
    return data as T;
  }

  private async callWithTextFallback<T = unknown>(
    method: string,
    body: Record<string, unknown>
  ): Promise<T> {
    try {
      return await this.call<T>(method, body);
    } catch (error) {
      if (isEntityParseError(error) && body.parse_mode) {
        const { parse_mode: _parseMode, ...plain } = body;
        return await this.call<T>(method, plain);
      }
      throw error;
    }
  }

  async sendMessage(
    chatId: number,
    text: string,
    opts?: { keyboard?: string[][]; inlineKeyboard?: InlineButton[][] }
  ): Promise<{ result: { message_id: number } }> {
    const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "Markdown" };
    if (opts?.inlineKeyboard) {
      body.reply_markup = { inline_keyboard: opts.inlineKeyboard };
    } else if (opts?.keyboard) {
      body.reply_markup = {
        keyboard: opts.keyboard.map((row) => row.map((label) => ({ text: label }))),
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    } else {
      body.reply_markup = { remove_keyboard: true };
    }
    return this.callWithTextFallback("sendMessage", body);
  }

  sendChatAction(chatId: number, action: "typing" | "upload_document" = "typing") {
    return this.call("sendChatAction", { chat_id: chatId, action });
  }

  editMessageReplyMarkup(
    chatId: number,
    messageId: number,
    inlineKeyboard: InlineButton[][] | { inlineKeyboard: InlineButton[][] } | null
  ) {
    const keyboard = inlineKeyboard === null
      ? null
      : Array.isArray(inlineKeyboard)
        ? inlineKeyboard
        : inlineKeyboard.inlineKeyboard;

    return this.call("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  }

  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    opts?: { inlineKeyboard?: InlineButton[][] }
  ) {
    return this.callWithTextFallback("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "Markdown",
      reply_markup: opts?.inlineKeyboard ? { inline_keyboard: opts.inlineKeyboard } : undefined,
    });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  async getFileUrl(fileId: string): Promise<string> {
    const data = await this.call<{ result: { file_path: string } }>("getFile", { file_id: fileId });
    return `https://api.telegram.org/file/bot${this.token}/${data.result.file_path}`;
  }

  setWebhook(url: string, secretToken: string) {
    return this.call("setWebhook", { url, secret_token: secretToken });
  }

  setMyCommands(commands: { command: string; description: string }[]) {
    return this.call("setMyCommands", { commands });
  }

  async sendDocument(chatId: number, filename: string, bytes: Uint8Array, caption?: string): Promise<void> {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption);
    form.append(
      "document",
      new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      filename
    );

    const res = await fetch(`${this.base}/sendDocument`, { method: "POST", body: form });
    const data = await res.json() as { ok?: boolean; description?: string };
    if (!res.ok || data.ok === false) {
      throw new TelegramApiError("sendDocument", data.description ?? `HTTP ${res.status}`, data);
    }
  }
}

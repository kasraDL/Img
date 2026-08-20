const API_BASE = "https://api.telegram.org/bot";

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string; // for "open in mail app" buttons (mailto:) - set exactly one of url/callback_data
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
      throw new Error(`Telegram API error on ${method}: ${JSON.stringify(data)}`);
    }
    return data as T;
  }

  async sendMessage(
    chatId: number,
    text: string,
    opts?: { keyboard?: string[][]; inlineKeyboard?: InlineButton[][] }
  ): Promise<{ result: { message_id: number } }> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    };
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
    return this.call("sendMessage", body);
  }

  sendChatAction(chatId: number, action: "typing" | "upload_document" = "typing") {
    return this.call("sendChatAction", { chat_id: chatId, action });
  }

  /** Updates just the buttons under an already-sent message (e.g. after a tap, to reflect the new state). Pass null to clear them. */
  editMessageReplyMarkup(chatId: number, messageId: number, inlineKeyboard: InlineButton[][] | null) {
    return this.call("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: inlineKeyboard ?? [] },
    });
  }

  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    opts?: { inlineKeyboard?: InlineButton[][] }
  ) {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "Markdown",
      reply_markup: opts?.inlineKeyboard ? { inline_keyboard: opts.inlineKeyboard } : undefined,
    });
  }

  /** Must be called after every callback_query - it's what stops Telegram showing a loading spinner on the button. */
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

  async setWebhook(url: string, secretToken: string) {
    return this.call("setWebhook", { url, secret_token: secretToken });
  }

  /** Populates the "/" command menu button in Telegram's UI. Call once from /setup. */
  async setMyCommands(commands: { command: string; description: string }[]) {
    return this.call("setMyCommands", { commands });
  }

  /** Sends a file (e.g. the generated Excel tracker) as a document attachment. */
  async sendDocument(chatId: number, filename: string, bytes: Uint8Array, caption?: string): Promise<void> {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption);
    // Cast needed because Uint8Array's ArrayBufferLike (which technically allows
    // SharedArrayBuffer) doesn't structurally satisfy BlobPart in strict lib.dom
    // typings, even though a plain Uint8Array like this always works fine at runtime.
    form.append(
      "document",
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename
    );
    const res = await fetch(`${this.base}/sendDocument`, { method: "POST", body: form });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Telegram API error on sendDocument: ${errText}`);
    }
  }
}

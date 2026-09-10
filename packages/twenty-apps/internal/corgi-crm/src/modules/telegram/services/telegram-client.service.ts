const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';

type TelegramClientOptions = {
  token: string;
  timeoutMs?: number;
};

export class TelegramDeliveryError extends Error {
  public constructor(
    message: string,
    public readonly mayHaveSucceeded: boolean,
  ) {
    super(message);
    this.name = 'TelegramDeliveryError';
  }
}

export class TelegramClient {
  private readonly token: string;
  private readonly timeoutMs: number;

  public constructor({ token, timeoutMs = 8_000 }: TelegramClientOptions) {
    if (!token.trim()) throw new Error('Telegram bot token is required');
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  private async call(method: string, body: Record<string, unknown>) {
    let response: Response;
    try {
      response = await fetch(
        `${TELEGRAM_API_ORIGIN}/bot${this.token}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: 'error',
        },
      );
    } catch {
      // Once fetch starts, a timeout or socket failure cannot tell us whether
      // Telegram accepted the request. Callers must not retry that ambiguity.
      throw new TelegramDeliveryError(
        `Telegram ${method} request outcome is unknown`,
        true,
      );
    }
    if (!response.ok) {
      // Provider bodies may echo request data. Do not include any provider body,
      // URL, token, chat ID, or message text in the surfaced error.
      throw new TelegramDeliveryError(
        `Telegram ${method} failed with HTTP ${response.status}`,
        false,
      );
    }
    const result = (await response.json()) as { ok?: boolean };
    if (result.ok !== true) {
      throw new TelegramDeliveryError(
        `Telegram ${method} was rejected`,
        false,
      );
    }
  }

  public sendMessage(chatId: string, text: string): Promise<void> {
    return this.call('sendMessage', { chat_id: chatId, text });
  }

  public answerCallbackQuery(callbackQueryId: string): Promise<void> {
    return this.call('answerCallbackQuery', { callback_query_id: callbackQueryId });
  }
}

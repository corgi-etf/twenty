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
    let result: { ok?: boolean; error_code?: number } | null;
    try {
      result = await response.json();
    } catch {
      throw new TelegramDeliveryError(
        `Telegram ${method} returned an unconfirmed response`,
        true,
      );
    }
    if (response.ok && result?.ok === true) return;

    // A gateway/server failure can follow an accepted send. Only a parsed
    // Telegram rejection can authorize another automatic attempt.
    const errorCode = result?.error_code ?? response.status;
    const definitelyRejected =
      result?.ok === false &&
      response.status < 500 &&
      errorCode >= 400 &&
      errorCode < 500;
    // Provider bodies may echo request data; keep all error details redacted.
    throw new TelegramDeliveryError(
      response.ok
        ? `Telegram ${method} was rejected`
        : `Telegram ${method} failed with HTTP ${response.status}`,
      !definitelyRejected,
    );
  }

  public sendMessage(chatId: string, text: string): Promise<void> {
    return this.call('sendMessage', { chat_id: chatId, text });
  }

  public answerCallbackQuery(callbackQueryId: string): Promise<void> {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
    });
  }
}

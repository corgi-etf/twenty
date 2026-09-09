export type ParsedTelegramUpdate = {
  updateId: number;
  userId: string;
  chatId: string;
  firstName: string;
  text: string;
  callbackQueryId?: string;
};

export type KeyValueStore = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
};

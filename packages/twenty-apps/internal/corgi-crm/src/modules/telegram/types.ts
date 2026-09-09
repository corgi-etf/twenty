export type ParsedTelegramUpdate = {
  updateId: number;
  userId: string;
  chatId: string;
  firstName: string;
  text: string;
  callbackQueryId?: string;
};

export type KeyValueStore = {
  get(key: string): Promise<unknown | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
};

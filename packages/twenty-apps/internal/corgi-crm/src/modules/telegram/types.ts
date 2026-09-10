type TelegramUpdateIdentity = {
  updateId: number;
  userId: string;
  chatId: string;
  firstName: string;
  text: string;
  messageTimestamp: string;
  callbackQueryId?: string;
};

// A group-topic update carries its thread so replies land back in the topic
// that asked; a private update must never carry one.
export type ParsedTelegramUpdate =
  | (TelegramUpdateIdentity & { chatScope: 'private' })
  | (TelegramUpdateIdentity & {
      chatScope: 'group_topic';
      messageThreadId: number;
    });

export type KeyValueStore = {
  get(key: string): Promise<unknown | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
};

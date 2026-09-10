import { type KeyValueStore } from 'src/modules/telegram/types';

export const readTelegramReportSnapshot = async ({
  key,
  store,
  read,
}: {
  key: string;
  store: KeyValueStore;
  read(): Promise<string>;
}): Promise<string> => {
  const snapshotKey = `telegram:report:${key}`;
  const existing = await store.get(snapshotKey);
  if (existing !== null && existing !== undefined) {
    if (typeof existing !== 'string' || !existing) {
      throw new Error('Invalid persisted Telegram report');
    }
    return existing;
  }
  const text = await read();
  await store.set(snapshotKey, text);
  return text;
};

import { type NamedRecord } from 'src/modules/outreach/types';
import { type KeyValueStore } from 'src/modules/telegram/types';

export type TelegramLink = {
  wholesalerId: string;
  wholesalerName: string;
  userId: string;
  chatId: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const parseTelegramLinkCodes = (raw: string | undefined) => {
  if (!raw?.trim()) return new Map<string, string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('CORGI_CRM_TELEGRAM_LINK_CODES must be valid JSON');
  }
  if (!isRecord(parsed)) {
    throw new Error('CORGI_CRM_TELEGRAM_LINK_CODES must be a JSON object');
  }

  const result = new Map<string, string>();
  for (const [code, workspaceMemberId] of Object.entries(parsed)) {
    if (!code.trim() || typeof workspaceMemberId !== 'string' || !workspaceMemberId.trim()) {
      throw new Error('Every Telegram link code must map to a workspace member ID');
    }
    result.set(code, workspaceMemberId.trim());
  }
  return result;
};

export const getTelegramLink = (
  store: KeyValueStore,
  userId: string,
): Promise<TelegramLink | null> => store.get<TelegramLink>(`telegram:user:${userId}`);

export const getTelegramDeliveryRoster = async (
  store: KeyValueStore,
): Promise<TelegramLink[]> => {
  const roster = await store.get<unknown>('telegram:delivery-roster');
  if (!Array.isArray(roster)) return [];
  return roster.filter((entry): entry is TelegramLink => {
    if (!isRecord(entry)) return false;
    return ['wholesalerId', 'wholesalerName', 'userId', 'chatId'].every(
      (key) => typeof entry[key] === 'string' && Boolean(entry[key].trim()),
    );
  });
};

export const linkTelegramAccount = async ({
  code,
  userId,
  chatId,
  configuredCodes,
  findWholesalers,
  store,
}: {
  code: string;
  userId: string;
  chatId: string;
  configuredCodes: ReadonlyMap<string, string>;
  findWholesalers(workspaceMemberId: string): Promise<NamedRecord[]>;
  store: KeyValueStore;
}): Promise<TelegramLink> => {
  const workspaceMemberId = configuredCodes.get(code);
  if (!workspaceMemberId) throw new Error('Invalid link code');

  const wholesalers = await findWholesalers(workspaceMemberId);
  if (wholesalers.length !== 1) {
    throw new Error('Link code must resolve to exactly one wholesaler');
  }
  const wholesaler = wholesalers[0]!;
  const claimKey = `telegram:workspace-member:${workspaceMemberId}`;
  const existingClaim = await store.get<{ userId: string }>(claimKey);
  if (existingClaim && existingClaim.userId !== userId) {
    throw new Error('This link code has already been claimed');
  }

  const link = {
    wholesalerId: wholesaler.id,
    wholesalerName: wholesaler.name,
    userId,
    chatId,
  };
  const roster = await getTelegramDeliveryRoster(store);
  const nextRoster = [
    ...roster.filter(
      (entry) => entry.userId !== userId && entry.wholesalerId !== wholesaler.id,
    ),
    link,
  ].sort((left, right) => left.wholesalerId.localeCompare(right.wholesalerId));

  // Persist only CRM/Telegram identities. Neither the secret code nor a
  // fingerprint of it enters durable state or logs.
  await store.set(claimKey, { userId });
  await store.set(`telegram:user:${userId}`, link);
  await store.set('telegram:delivery-roster', nextRoster);
  return link;
};

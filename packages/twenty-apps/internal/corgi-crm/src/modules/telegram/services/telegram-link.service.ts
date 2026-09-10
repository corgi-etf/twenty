import { type NamedRecord } from 'src/modules/outreach/types';
import { type KeyValueStore } from 'src/modules/telegram/types';

export type TelegramLinkBinding = {
  code: string;
  workspaceMemberId: string;
  telegramUserId: string;
};

export type TelegramLink = {
  workspaceMemberId: string;
  wholesalerId: string;
  wholesalerName: string;
  userId: string;
  chatId: string;
};

export type TelegramIdentitySource = {
  findWorkspaceMember(
    workspaceMemberId: string,
  ): Promise<{ id: string; active: boolean } | null>;
  findWholesalers(
    workspaceMemberId: string,
  ): Promise<Array<NamedRecord & { workspaceMemberId: string }>>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TELEGRAM_USER_ID_PATTERN = /^[1-9][0-9]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parseBinding = (value: unknown): TelegramLinkBinding => {
  if (!isRecord(value)) throw new Error('Every Telegram link binding must be an object');
  const code = typeof value.code === 'string' ? value.code.trim() : '';
  const workspaceMemberId =
    typeof value.workspaceMemberId === 'string'
      ? value.workspaceMemberId.trim()
      : '';
  const telegramUserId =
    typeof value.telegramUserId === 'string' ? value.telegramUserId.trim() : '';
  if (!code) throw new Error('Every Telegram link binding needs a code');
  if (!UUID_PATTERN.test(workspaceMemberId)) {
    throw new Error('Every Telegram link binding needs a workspace member UUID');
  }
  if (!TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    throw new Error('Every Telegram link binding needs a numeric Telegram user ID');
  }
  return { code, workspaceMemberId, telegramUserId };
};

export const parseTelegramLinkBindings = (
  raw: string | undefined,
): TelegramLinkBinding[] => {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('CORGI_CRM_TELEGRAM_LINK_CODES must be valid JSON');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.bindings)) {
    throw new Error(
      'CORGI_CRM_TELEGRAM_LINK_CODES must be an object with a bindings array',
    );
  }

  const bindings = parsed.bindings.map(parseBinding);
  for (const [property, label] of [
    ['code', 'code'],
    ['workspaceMemberId', 'workspace member'],
    ['telegramUserId', 'Telegram user'],
  ] as const) {
    const values = bindings.map((entry) => entry[property]);
    if (new Set(values).size !== values.length) {
      throw new Error(`Duplicate Telegram link ${label} binding`);
    }
  }
  return bindings;
};

const asTelegramLink = (value: unknown): TelegramLink | null => {
  if (!isRecord(value)) return null;
  if (
    ![
      'workspaceMemberId',
      'wholesalerId',
      'wholesalerName',
      'userId',
      'chatId',
    ].every(
      (key) => typeof value[key] === 'string' && Boolean(value[key].trim()),
    )
  ) {
    return null;
  }
  return value as TelegramLink;
};

const removeLink = async (store: KeyValueStore, link: TelegramLink) => {
  await Promise.all([
    store.delete(`telegram:user:${link.userId}`),
    store.delete(`telegram:member:${link.workspaceMemberId}`),
  ]);
};

const isCurrentIdentity = async (
  link: TelegramLink,
  identity: TelegramIdentitySource,
) => {
  const member = await identity.findWorkspaceMember(link.workspaceMemberId);
  if (!member || !member.active || member.id !== link.workspaceMemberId) return false;
  const wholesalers = await identity.findWholesalers(link.workspaceMemberId);
  return (
    wholesalers.length === 1 &&
    wholesalers[0]!.id === link.wholesalerId &&
    wholesalers[0]!.workspaceMemberId === link.workspaceMemberId
  );
};

const validateStoredLink = async ({
  value,
  store,
  identity,
}: {
  value: unknown;
  store: KeyValueStore;
  identity: TelegramIdentitySource;
}): Promise<TelegramLink | null> => {
  const link = asTelegramLink(value);
  if (!link) return null;
  if (await isCurrentIdentity(link, identity)) return link;
  await removeLink(store, link);
  return null;
};

export const getValidatedTelegramLink = async ({
  store,
  userId,
  identity,
}: {
  store: KeyValueStore;
  userId: string;
  identity: TelegramIdentitySource;
}): Promise<TelegramLink | null> =>
  validateStoredLink({
    value: await store.get(`telegram:user:${userId}`),
    store,
    identity,
  });

export const getValidatedTelegramDeliveryRoster = async ({
  store,
  configuredBindings,
  identity,
}: {
  store: KeyValueStore;
  configuredBindings: readonly TelegramLinkBinding[];
  identity: TelegramIdentitySource;
}): Promise<TelegramLink[]> => {
  const links = await Promise.all(
    configuredBindings.map(async ({ workspaceMemberId, telegramUserId }) => {
      const link = await validateStoredLink({
        value: await store.get(`telegram:member:${workspaceMemberId}`),
        store,
        identity,
      });
      return link?.workspaceMemberId === workspaceMemberId &&
        link.userId === telegramUserId
        ? link
        : null;
    }),
  );
  return links.filter((link): link is TelegramLink => link !== null);
};

export const linkTelegramAccount = async ({
  code,
  userId,
  chatId,
  configuredBindings,
  identity,
  store,
}: {
  code: string;
  userId: string;
  chatId: string;
  configuredBindings: readonly TelegramLinkBinding[];
  identity: TelegramIdentitySource;
  store: KeyValueStore;
}): Promise<TelegramLink> => {
  const binding = configuredBindings.find(
    (candidate) => candidate.code === code && candidate.telegramUserId === userId,
  );
  if (!binding) throw new Error('Invalid link code');

  const member = await identity.findWorkspaceMember(binding.workspaceMemberId);
  if (!member || !member.active || member.id !== binding.workspaceMemberId) {
    throw new Error('Link code does not resolve to an active workspace member');
  }
  const wholesalers = await identity.findWholesalers(binding.workspaceMemberId);
  if (
    wholesalers.length !== 1 ||
    wholesalers[0]!.workspaceMemberId !== binding.workspaceMemberId
  ) {
    throw new Error('Link code must resolve to exactly one wholesaler');
  }
  const wholesaler = wholesalers[0]!;
  const link = {
    workspaceMemberId: binding.workspaceMemberId,
    wholesalerId: wholesaler.id,
    wholesalerName: wholesaler.name,
    userId,
    chatId,
  };

  // Each binding has a unique Telegram user and workspace member, so racing
  // retries can only write the same owner. Secret codes are never persisted.
  await Promise.all([
    store.set(`telegram:user:${userId}`, link),
    store.set(`telegram:member:${binding.workspaceMemberId}`, link),
  ]);
  return link;
};

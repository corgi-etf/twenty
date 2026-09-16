import { deterministicCorgiUuid } from 'src/modules/core/deterministic-uuid';

// Kept as the Telegram-facing name over the shared construction, so existing
// ids stay byte-identical while the same derivation is reusable elsewhere.
export const deterministicTelegramUuid = deterministicCorgiUuid;

export const getTelegramActivityId = (updateId: number): string => {
  if (!Number.isSafeInteger(updateId) || updateId < 0) {
    throw new Error('Telegram update ID must be a non-negative safe integer');
  }
  return deterministicTelegramUuid('telegram-update', String(updateId));
};

export const getTelegramDeliveryId = (deliveryKey: string): string =>
  deterministicTelegramUuid('telegram-delivery', deliveryKey);

export const getTelegramDeliveryAuditId = (requestId: string): string =>
  deterministicTelegramUuid('telegram-delivery-audit', requestId);

import { createHash } from 'node:crypto';

const deterministicUuid = (kind: string, value: string): string => {
  const bytes = createHash('sha256')
    .update(`corgi-crm:${kind}\0${value}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const getTelegramActivityId = (updateId: number): string => {
  if (!Number.isSafeInteger(updateId) || updateId < 0) {
    throw new Error('Telegram update ID must be a non-negative safe integer');
  }
  return deterministicUuid('telegram-update', String(updateId));
};

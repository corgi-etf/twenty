import { createHash } from 'node:crypto';

export const FETCH_MIGRATION_NAMESPACE =
  '9c0a3020-1a52-5bb7-a0df-31fcf39f55dc';

const uuidBytes = (uuid: string): Buffer =>
  Buffer.from(uuid.replaceAll('-', ''), 'hex');

const formatUuid = (bytes: Buffer): string => {
  const hex = bytes.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};

export const deterministicId = (kind: string, sourceId: string): string => {
  if (kind.trim() === '' || sourceId.trim() === '') {
    throw new Error('Deterministic IDs require a non-empty kind and source ID');
  }

  const digest = createHash('sha1')
    .update(uuidBytes(FETCH_MIGRATION_NAMESPACE))
    .update(`${kind}:${sourceId}`)
    .digest();

  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;

  return formatUuid(digest.subarray(0, 16));
};

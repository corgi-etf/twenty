import { sourceRowHmac } from './integrity.ts';

export const MIGRATION_TRANSFORM_CONTRACT_VERSION = '1';

export const migrationSourceHmac = (
  sourceProjection: unknown,
  hmacKey: string,
  transformContractVersion = MIGRATION_TRANSFORM_CONTRACT_VERSION,
): string =>
  sourceRowHmac({ sourceProjection, transformContractVersion }, hmacKey);

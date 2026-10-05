import { type ObjectRecordOperationBrowserEventDetail } from '@/browser-event/types/ObjectRecordOperationBrowserEventDetail';
import { type CorgiWin } from '@/corgi-crm/types/CorgiHome';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const nonblank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const validDate = (value: unknown) =>
  nonblank(value) && Number.isFinite(Date.parse(value));
const positiveMicros = (value: unknown) =>
  typeof value === 'number'
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === 'string' && /^\d+$/.test(value) && BigInt(value) > 0n;
const hasRelation = (record: Record<string, unknown>, name: string) => {
  if (nonblank(record[`${name}Id`])) return true;
  const relation = asRecord(record[name]);
  const connect = asRecord(relation?.connect);
  const id = asRecord(connect?.where)?.id;

  return (
    nonblank(relation?.id) ||
    nonblank(connect?.id) ||
    nonblank(id) ||
    nonblank(asRecord(id)?.eq)
  );
};

export const getCorgiLocalCreationKey = (
  detail: ObjectRecordOperationBrowserEventDetail,
): string | undefined => {
  if (
    detail.source !== 'local-mutation' ||
    detail.operation.type !== 'create-one'
  )
    return undefined;
  const object = detail.objectMetadataItem.nameSingular;
  const record = { ...detail.operation.createdRecord, ...detail.createInput };
  const id = detail.operation.createdRecord.id;

  if (!nonblank(id) || !hasRelation(record, 'company')) return undefined;
  if (object === 'meetingBooking') {
    if (
      !['BOOKED', 'COMPLETED'].includes(String(record.status)) ||
      !validDate(record.scheduledAt) ||
      !hasRelation(record, 'wholesaler') ||
      (record.status === 'COMPLETED' && !validDate(record.heldAt))
    )
      return undefined;
  } else if (object === 'companyAllocation') {
    const amount = asRecord(record.amount);

    if (
      !nonblank(record.ticker) ||
      !positiveMicros(amount?.amountMicros) ||
      typeof amount?.currencyCode !== 'string' ||
      !/^[A-Z]{3}$/.test(amount.currencyCode)
    )
      return undefined;
  } else return undefined;

  return `${object}:${id}`;
};

export const getCorgiWinCreationKeys = (
  wins: CorgiWin[],
  workspaceMemberId: string,
) =>
  wins
    .filter((win) => win.actorWorkspaceMemberId === workspaceMemberId)
    .map((win) => `${win.record.objectNameSingular}:${win.record.id}`);

export type CorgiCreationEvidence = {
  localKeys: string[];
  validKeys: string[];
  consumedKeys: string[];
};

// Retain only bounded identifiers. Either the successful mutation or the valid
// source event can arrive first; both are required, and each pair is consumed once.
export const reconcileCorgiCreationEvidence = (
  previous: CorgiCreationEvidence,
  localKeys: string[] = [],
  validKeys: string[] = [],
) => {
  const local = new Set([...previous.localKeys, ...localKeys]);
  const valid = new Set([...previous.validKeys, ...validKeys]);
  const consumed = new Set(previous.consumedKeys);
  let shouldCelebrate = false;

  for (const key of local) {
    if (!valid.has(key) || consumed.has(key)) continue;
    consumed.add(key);
    shouldCelebrate = true;
  }

  return {
    shouldCelebrate,
    state: {
      localKeys: [...local].filter((key) => !consumed.has(key)).slice(-500),
      validKeys: [...valid].filter((key) => !consumed.has(key)).slice(-500),
      consumedKeys: [...consumed].slice(-500),
    },
  };
};

import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  TELEGRAM_DELIVERY_REASON_VALUES,
  TELEGRAM_DELIVERY_STATUS_VALUES,
} from 'src/modules/telegram/telegram-persistence-values';

export type TelegramDeliveryStatus = keyof typeof TELEGRAM_DELIVERY_STATUS_VALUES;

const fromStoredEnum = <T extends string>(
  values: Record<T, string>, value: unknown, label: string,
): T => {
  const entry = (Object.entries(values) as Array<[T, string]>)
    .find(([, storedValue]) => storedValue === value);
  if (!entry) throw new Error(`Invalid stored Telegram delivery ${label}`);
  return entry[0];
};

const toStoredEnum = <T extends string>(
  values: Record<T, string>, value: string, label: string,
): string => {
  if (!Object.prototype.hasOwnProperty.call(values, value)) {
    throw new Error(`Invalid Telegram delivery ${label}`);
  }
  return values[value as T];
};

export type TelegramDeliveryRecord = {
  id: string;
  deliveryKey: string;
  operationDigest: string;
  status: TelegramDeliveryStatus;
  stateToken: string;
  attempts: number;
  resetCount: number;
  createdAt: string;
  updatedAt: string;
  unknownAt?: string | null;
  lastReasonCode?: string | null;
  retryRequestId?: string | null;
  approvedUnknownAt?: string | null;
};

export type TelegramDeliveryAuditRecord = {
  id: string;
  requestId: string;
  deliveryKey: string;
  expectedUnknownAt: string;
  actorWorkspaceMemberId: string;
  reasonDigest: string;
  requestedAt: string;
};

type DynamicCoreApiClient = {
  query(selection: Record<string, unknown>): Promise<Record<string, unknown>>;
  mutation(selection: Record<string, unknown>): Promise<Record<string, unknown>>;
};

const fromStoredDelivery = (record: TelegramDeliveryRecord): TelegramDeliveryRecord => ({
  ...record,
  status: fromStoredEnum(TELEGRAM_DELIVERY_STATUS_VALUES, record.status, 'status'),
  ...(record.lastReasonCode == null ? {} : {
    lastReasonCode: fromStoredEnum(TELEGRAM_DELIVERY_REASON_VALUES, record.lastReasonCode, 'reason'),
  }),
});

const toStoredPatch = (record: Partial<TelegramDeliveryRecord>) => ({
  ...record,
  ...(record.status === undefined ? {} : {
    status: toStoredEnum(TELEGRAM_DELIVERY_STATUS_VALUES, record.status, 'status'),
  }),
  ...(record.lastReasonCode == null ? {} : {
    lastReasonCode: toStoredEnum(TELEGRAM_DELIVERY_REASON_VALUES, record.lastReasonCode, 'reason'),
  }),
});

const deliverySelection = {
  id: true,
  deliveryKey: true,
  operationDigest: true,
  status: true,
  stateToken: true,
  attempts: true,
  resetCount: true,
  createdAt: true,
  updatedAt: true,
  unknownAt: true,
  lastReasonCode: true,
  retryRequestId: true,
  approvedUnknownAt: true,
};

const auditSelection = {
  id: true,
  requestId: true,
  deliveryKey: true,
  expectedUnknownAt: true,
  actorWorkspaceMemberId: true,
  reasonDigest: true,
  requestedAt: true,
};

const edgesFrom = <T>(result: Record<string, unknown>, key: string): T[] => {
  const connection = result[key] as
    | { edges?: Array<{ node?: T }> }
    | undefined;
  return (connection?.edges ?? []).flatMap((edge) =>
    edge.node ? [edge.node] : [],
  );
};

const exactDelivery = (
  left: TelegramDeliveryRecord,
  right: TelegramDeliveryRecord,
) =>
  left.id === right.id &&
  left.deliveryKey === right.deliveryKey &&
  left.operationDigest === right.operationDigest;

const exactOwnedIntent = (
  left: TelegramDeliveryRecord,
  right: TelegramDeliveryRecord,
) =>
  exactDelivery(left, right) &&
  left.status === 'intent' &&
  left.stateToken === right.stateToken &&
  left.attempts === right.attempts &&
  left.resetCount === right.resetCount &&
  typeof left.createdAt === 'string' &&
  typeof left.updatedAt === 'string';

const exactAudit = (
  left: TelegramDeliveryAuditRecord,
  right: TelegramDeliveryAuditRecord,
) =>
  left.id === right.id &&
  left.requestId === right.requestId &&
  left.deliveryKey === right.deliveryKey &&
  left.expectedUnknownAt === right.expectedUnknownAt &&
  left.actorWorkspaceMemberId === right.actorWorkspaceMemberId &&
  left.reasonDigest === right.reasonDigest &&
  left.requestedAt === right.requestedAt;

export class CoreTelegramDeliveryRepository {
  private readonly dynamicClient: DynamicCoreApiClient;

  public constructor(client: CoreApiClient) {
    this.dynamicClient = client as unknown as DynamicCoreApiClient;
  }

  public async get(deliveryKey: string): Promise<TelegramDeliveryRecord | null> {
    const result = await this.dynamicClient.query({
      telegramDeliveries: {
        __args: { filter: { deliveryKey: { eq: deliveryKey } }, first: 2 },
        edges: { node: deliverySelection },
      },
    });
    const records = edgesFrom<TelegramDeliveryRecord>(result, 'telegramDeliveries');
    if (records.length > 1) throw new Error('Telegram delivery key is not unique');
    return records[0] ? fromStoredDelivery(records[0]) : null;
  }

  private async getById(id: string): Promise<TelegramDeliveryRecord | null> {
    const result = await this.dynamicClient.query({
      telegramDeliveries: {
        __args: { filter: { id: { eq: id } }, first: 2 },
        edges: { node: deliverySelection },
      },
    });
    const records = edgesFrom<TelegramDeliveryRecord>(result, 'telegramDeliveries');
    if (records.length > 1) throw new Error('Telegram delivery ID is not unique');
    return records[0] ? fromStoredDelivery(records[0]) : null;
  }

  public async claim(record: TelegramDeliveryRecord) {
    try {
      const result = await this.dynamicClient.mutation({
        createTelegramDelivery: {
          __args: {
            data: {
              id: record.id,
              name: record.deliveryKey.slice(-12),
              deliveryKey: record.deliveryKey,
              operationDigest: record.operationDigest,
              status: toStoredEnum(TELEGRAM_DELIVERY_STATUS_VALUES, record.status, 'status'),
              stateToken: record.stateToken,
              attempts: record.attempts,
              resetCount: record.resetCount,
            },
          },
          ...deliverySelection,
        },
      });
      const stored = result.createTelegramDelivery as
        | TelegramDeliveryRecord
        | null
        | undefined;
      const created = stored ? fromStoredDelivery(stored) : null;
      if (created && exactOwnedIntent(created, record)) {
        return { acquired: true, record: created } as const;
      }
    } catch {
      // A transport error may happen after the insert committed. The exact
      // caller-generated state token below distinguishes our insert from a
      // competing process that won the unique delivery-key claim.
    }
    const existing = await this.get(record.deliveryKey);
    if (!existing) {
      throw new Error('Could not confirm rejected Telegram delivery claim');
    }
    if (!exactDelivery(existing, record)) {
      throw new Error('Telegram delivery deterministic claim collision');
    }
    return exactOwnedIntent(existing, record)
      ? ({ acquired: true, record: existing } as const)
      : ({ acquired: false, record: existing } as const);
  }

  public async transition({
    id,
    expectedStatus,
    expectedStateToken,
    patch,
  }: {
    id: string;
    expectedStatus: TelegramDeliveryStatus;
    expectedStateToken: string;
    patch: Partial<TelegramDeliveryRecord>;
  }): Promise<boolean> {
    if (!patch.status || !patch.stateToken) return false;
    try {
      const result = await this.dynamicClient.mutation({
        updateTelegramDeliveries: {
          __args: {
            data: toStoredPatch(patch),
            filter: {
              and: [
                { id: { eq: id } },
                { status: { eq: toStoredEnum(TELEGRAM_DELIVERY_STATUS_VALUES, expectedStatus, 'status') } },
                { stateToken: { eq: expectedStateToken } },
              ],
            },
          },
          id: true,
          status: true,
          stateToken: true,
        },
      });
      const records = result.updateTelegramDeliveries;
      if (
        Array.isArray(records) &&
        records.length === 1 &&
        records[0]?.id === id &&
        records[0]?.status === TELEGRAM_DELIVERY_STATUS_VALUES[patch.status] &&
        records[0]?.stateToken === patch.stateToken
      ) {
        return true;
      }
    } catch {
      // The update may have committed before the response was lost. Read back
      // the exact row and only accept the caller-generated target fence.
    }
    const persisted = await this.getById(id);
    return (
      persisted?.id === id &&
      persisted.status === patch.status &&
      persisted.stateToken === patch.stateToken
    );
  }

  public async getAudit(
    requestId: string,
  ): Promise<TelegramDeliveryAuditRecord | null> {
    const result = await this.dynamicClient.query({
      telegramDeliveryAudits: {
        __args: { filter: { requestId: { eq: requestId } }, first: 2 },
        edges: { node: auditSelection },
      },
    });
    const records = edgesFrom<TelegramDeliveryAuditRecord>(
      result,
      'telegramDeliveryAudits',
    );
    if (records.length > 1) throw new Error('Telegram audit request is not unique');
    return records[0] ?? null;
  }

  public async recordResetAudit(record: TelegramDeliveryAuditRecord) {
    try {
      const result = await this.dynamicClient.mutation({
        createTelegramDeliveryAudit: {
          __args: {
            data: {
              ...record,
              name: record.requestId,
            },
          },
          ...auditSelection,
        },
      });
      const created = result.createTelegramDeliveryAudit as
        | TelegramDeliveryAuditRecord
        | null
        | undefined;
      if (created && exactAudit(created, record)) {
        return { acquired: true, record: created } as const;
      }
    } catch {
      // Readback below distinguishes an idempotent replay from a competing
      // generation claim even when the create response was lost.
    }
    const existing = await this.getAudit(record.requestId);
    if (!existing) {
      throw new Error('Could not confirm rejected Telegram reset audit');
    }
    if (!exactAudit(existing, record)) {
      throw new Error('Telegram reset audit deterministic claim collision');
    }
    return { acquired: false, record: existing } as const;
  }
}

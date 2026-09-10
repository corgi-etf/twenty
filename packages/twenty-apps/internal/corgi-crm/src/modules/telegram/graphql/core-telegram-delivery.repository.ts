import { type CoreApiClient } from 'twenty-client-sdk/core';

export type TelegramDeliveryStatus =
  | 'ready'
  | 'retry_approved'
  | 'intent'
  | 'unknown'
  | 'complete';

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

const exactAudit = (
  left: TelegramDeliveryAuditRecord,
  right: TelegramDeliveryAuditRecord,
) =>
  left.id === right.id &&
  left.requestId === right.requestId &&
  left.deliveryKey === right.deliveryKey &&
  left.expectedUnknownAt === right.expectedUnknownAt &&
  left.actorWorkspaceMemberId === right.actorWorkspaceMemberId &&
  left.reasonDigest === right.reasonDigest;

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
    return records[0] ?? null;
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
              status: record.status,
              stateToken: record.stateToken,
              attempts: record.attempts,
              resetCount: record.resetCount,
            },
          },
          ...deliverySelection,
        },
      });
      return {
        acquired: true,
        record: result.createTelegramDelivery as TelegramDeliveryRecord,
      } as const;
    } catch {
      const existing = await this.get(record.deliveryKey);
      if (!existing) {
        throw new Error('Could not confirm rejected Telegram delivery claim');
      }
      if (!exactDelivery(existing, record)) {
        throw new Error('Telegram delivery deterministic claim collision');
      }
      return { acquired: false, record: existing } as const;
    }
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
    const result = await this.dynamicClient.mutation({
      updateTelegramDeliveries: {
        __args: {
          data: patch,
          filter: {
            and: [
              { id: { eq: id } },
              { status: { eq: expectedStatus } },
              { stateToken: { eq: expectedStateToken } },
            ],
          },
        },
        id: true,
      },
    });
    return Array.isArray(result.updateTelegramDeliveries) &&
      result.updateTelegramDeliveries.length === 1;
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
      return {
        acquired: true,
        record: result.createTelegramDeliveryAudit as TelegramDeliveryAuditRecord,
      } as const;
    } catch {
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
}

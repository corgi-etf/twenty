import { createHash } from 'node:crypto';

import {
  assertTelegramDeliveryKey,
  type TelegramDeliveryState,
} from 'src/modules/telegram/services/telegram-delivery.service';
import { type KeyValueStore } from 'src/modules/telegram/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TelegramDeliveryResetJob = {
  deliveryKey: string;
  expectedUnknownAt: string;
  requestId: string;
};

type DeliveryAudit = TelegramDeliveryResetJob & {
  action: 'reset_requested';
  actorWorkspaceMemberId: string;
  reason: string;
  requestedAt: string;
};

const auditKey = (requestId: string) =>
  `telegram:delivery-audit:${requestId}`;

const readState = async (store: KeyValueStore, deliveryKey: string) => {
  assertTelegramDeliveryKey(deliveryKey);
  const state = (await store.get(deliveryKey)) as TelegramDeliveryState | null;
  if (!state) throw new Error('Telegram delivery was not found');
  return state;
};

export const inspectTelegramDelivery = async ({
  deliveryKey,
  store,
}: {
  deliveryKey: string;
  store: KeyValueStore;
}) => {
  const state = await readState(store, deliveryKey);
  return {
    deliveryKey,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    ...(state.unknownAt ? { unknownAt: state.unknownAt } : {}),
    attempts: state.attempts,
    resetCount: state.resetCount,
    ...(state.lastReasonCode
      ? { lastReasonCode: state.lastReasonCode }
      : {}),
  };
};

const sameAudit = (left: DeliveryAudit, right: DeliveryAudit) =>
  left.action === right.action &&
  left.deliveryKey === right.deliveryKey &&
  left.expectedUnknownAt === right.expectedUnknownAt &&
  left.requestId === right.requestId &&
  left.actorWorkspaceMemberId === right.actorWorkspaceMemberId &&
  left.reason === right.reason;

export const requestTelegramDeliveryReset = async ({
  deliveryKey,
  expectedUnknownAt,
  requestId,
  actorWorkspaceMemberId,
  confirmation,
  reason,
  store,
  enqueue,
  now,
}: TelegramDeliveryResetJob & {
  actorWorkspaceMemberId: string;
  confirmation: string;
  reason: string;
  store: KeyValueStore;
  enqueue(payload: TelegramDeliveryResetJob, jobId: string): Promise<unknown>;
  now(): Date;
}) => {
  if (confirmation !== 'RESET_UNKNOWN_TELEGRAM_DELIVERY') {
    throw new Error('Telegram delivery reset confirmation is invalid');
  }
  if (!UUID_PATTERN.test(requestId) || !UUID_PATTERN.test(actorWorkspaceMemberId)) {
    throw new Error('Telegram delivery reset identity is invalid');
  }
  if (reason.trim().length < 10) {
    throw new Error('Telegram delivery reset reason is required');
  }
  const state = await readState(store, deliveryKey);
  if (state.status !== 'unknown') {
    throw new Error('Telegram delivery reset is a replay or is not unknown');
  }
  if (state.unknownAt !== expectedUnknownAt) {
    throw new Error('Telegram delivery reset request is stale');
  }
  const audit: DeliveryAudit = {
    action: 'reset_requested',
    deliveryKey,
    expectedUnknownAt,
    requestId,
    actorWorkspaceMemberId,
    reason: reason.trim(),
    requestedAt: now().toISOString(),
  };
  const key = auditKey(requestId);
  const existingAudit = (await store.get(key)) as DeliveryAudit | null;
  if (existingAudit && !sameAudit(existingAudit, audit)) {
    throw new Error('Telegram delivery reset request ID was replayed');
  }
  if (!existingAudit) await store.set(key, audit);

  const retryScope = `${deliveryKey}:${expectedUnknownAt}`;
  const jobId = `telegram-delivery-retry-${createHash('sha256')
    .update(retryScope)
    .digest('hex')}`;
  await enqueue({ deliveryKey, expectedUnknownAt, requestId }, jobId);
  return { status: 'retry_enqueued' as const, deliveryKey, requestId };
};

export const readTelegramDeliveryResetAudit = async ({
  requestId,
  store,
}: {
  requestId: string;
  store: KeyValueStore;
}) => {
  if (!UUID_PATTERN.test(requestId)) {
    throw new Error('Telegram delivery reset request ID is invalid');
  }
  return (await store.get(auditKey(requestId))) as DeliveryAudit | null;
};

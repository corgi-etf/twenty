import { createHash } from 'node:crypto';

import {
  type CoreTelegramDeliveryRepository,
  type TelegramDeliveryAuditRecord,
} from 'src/modules/telegram/graphql/core-telegram-delivery.repository';
import { assertTelegramDeliveryKey } from 'src/modules/telegram/services/telegram-delivery.service';
import { getTelegramDeliveryAuditId } from 'src/modules/telegram/services/telegram-identifiers.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TelegramDeliveryResetJob = {
  deliveryKey: string;
  expectedUnknownAt: string;
  requestId: string;
};

const readState = async (
  repository: CoreTelegramDeliveryRepository,
  deliveryKey: string,
) => {
  assertTelegramDeliveryKey(deliveryKey);
  const state = await repository.get(deliveryKey);
  if (!state) throw new Error('Telegram delivery was not found');
  return state;
};

export const inspectTelegramDelivery = async ({
  deliveryKey,
  repository,
}: {
  deliveryKey: string;
  repository: CoreTelegramDeliveryRepository;
}) => {
  const state = await readState(repository, deliveryKey);
  return {
    deliveryKey,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    ...(state.unknownAt ? { unknownAt: state.unknownAt } : {}),
    attempts: state.attempts,
    resetCount: state.resetCount,
    ...(state.lastReasonCode ? { lastReasonCode: state.lastReasonCode } : {}),
  };
};

export const requestTelegramDeliveryReset = async ({
  deliveryKey,
  expectedUnknownAt,
  requestId,
  actorWorkspaceMemberId,
  confirmation,
  reason,
  repository,
  enqueue,
  now,
}: TelegramDeliveryResetJob & {
  actorWorkspaceMemberId: string;
  confirmation: string;
  reason: string;
  repository: CoreTelegramDeliveryRepository;
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
  const state = await readState(repository, deliveryKey);
  if (state.status !== 'unknown') {
    throw new Error('Telegram delivery reset is a replay or is not unknown');
  }
  if (state.unknownAt !== expectedUnknownAt) {
    throw new Error('Telegram delivery reset request is stale');
  }
  const audit: TelegramDeliveryAuditRecord = {
    id: getTelegramDeliveryAuditId(requestId),
    deliveryKey,
    expectedUnknownAt,
    requestId,
    actorWorkspaceMemberId,
    reasonDigest: createHash('sha256').update(reason.trim()).digest('hex'),
    requestedAt: now().toISOString(),
  };
  await repository.recordResetAudit(audit);

  const retryScope = `${deliveryKey}:${expectedUnknownAt}`;
  const jobId = `telegram-delivery-retry-${createHash('sha256')
    .update(retryScope)
    .digest('hex')}`;
  await enqueue({ deliveryKey, expectedUnknownAt, requestId }, jobId);
  return { status: 'retry_enqueued' as const, deliveryKey, requestId };
};

export const readTelegramDeliveryResetAudit = async ({
  requestId,
  repository,
}: {
  requestId: string;
  repository: CoreTelegramDeliveryRepository;
}) => {
  if (!UUID_PATTERN.test(requestId)) {
    throw new Error('Telegram delivery reset request ID is invalid');
  }
  return repository.getAudit(requestId);
};

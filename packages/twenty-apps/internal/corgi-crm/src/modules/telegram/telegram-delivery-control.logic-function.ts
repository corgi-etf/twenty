import { timingSafeEqual } from 'node:crypto';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import {
  enqueueJob,
  kv,
  type LogicFunctionExecutionContext,
  Response,
} from 'twenty-sdk/logic-function';

import {
  TELEGRAM_DELIVERY_CONTROL_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_RETRY_WORKER_UNIVERSAL_IDENTIFIER,
} from 'src/constants';
import {
  inspectTelegramDelivery,
  requestTelegramDeliveryReset,
  type TelegramDeliveryResetJob,
} from 'src/modules/telegram/services/telegram-delivery-control.service';
import { type KeyValueStore } from 'src/modules/telegram/types';
import { CoreTelegramDeliveryRepository } from 'src/modules/telegram/graphql/core-telegram-delivery.repository';

type ControlDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  operatorSecret: string | undefined;
  store: KeyValueStore;
  repository?: CoreTelegramDeliveryRepository;
  enqueue(payload: TelegramDeliveryResetJob, jobId: string): Promise<unknown>;
};

const safeOperatorProof = (provided: string | undefined, expected: string | undefined) => {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
};

const bodyObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Telegram delivery control request');
  }
  return value as Record<string, unknown>;
};

const stringValue = (body: Record<string, unknown>, key: string) => {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Telegram delivery control ${key} is required`);
  }
  return value.trim();
};

export const handleTelegramDeliveryControl = async (
  payload: RoutePayload<unknown>,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: ControlDependencies,
) => {
  if (
    context?.workspaceId !== dependencies.expectedWorkspaceId ||
    !context.userWorkspaceId ||
    !context.workspaceMemberId
  ) {
    throw new Error('Telegram delivery control refused workspace context');
  }
  if (
    !safeOperatorProof(
      payload.headers['x-corgi-telegram-operator-secret'],
      dependencies.operatorSecret,
    )
  ) {
    throw new Error('Unauthorized Telegram delivery operator');
  }
  if (dependencies.enabled !== 'true') return { status: 'disabled' } as const;
  const body = bodyObject(payload.body);
  const action = stringValue(body, 'action');
  const deliveryKey = stringValue(body, 'deliveryKey');
  if (action === 'inspect') {
    return new Response(
      await inspectTelegramDelivery({
        deliveryKey,
        repository:
          dependencies.repository ??
          (() => {
            throw new Error('Telegram delivery repository is required');
          })(),
      }),
      { status: 200 },
    );
  }
  if (action !== 'reset') {
    throw new Error('Unsupported Telegram delivery control action');
  }
  const result = await requestTelegramDeliveryReset({
    deliveryKey,
    expectedUnknownAt: stringValue(body, 'expectedUnknownAt'),
    requestId: stringValue(body, 'requestId'),
    actorWorkspaceMemberId: context.workspaceMemberId,
    confirmation: stringValue(body, 'confirmation'),
    reason: stringValue(body, 'reason'),
    repository:
      dependencies.repository ??
      (() => {
        throw new Error('Telegram delivery repository is required');
      })(),
    enqueue: dependencies.enqueue,
    now: () => new Date(),
  });
  return new Response(result, { status: 202 });
};

export const handler = async (
  payload: RoutePayload<unknown>,
  context?: LogicFunctionExecutionContext,
) =>
  handleTelegramDeliveryControl(payload, context, {
    expectedWorkspaceId: process.env.CORGI_CRM_WORKSPACE_ID?.trim() ?? '',
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    operatorSecret: process.env.CORGI_CRM_TELEGRAM_OPERATOR_SECRET,
    store: kv,
    repository: new CoreTelegramDeliveryRepository(new CoreApiClient()),
    enqueue: (jobPayload, jobId) =>
      enqueueJob({
        logicFunctionUniversalIdentifier:
          TELEGRAM_DELIVERY_RETRY_WORKER_UNIVERSAL_IDENTIFIER,
        payload: jobPayload,
        jobId,
        retryLimit: 5,
      }),
  });

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_DELIVERY_CONTROL_UNIVERSAL_IDENTIFIER,
  name: 'telegram-delivery-control',
  description:
    'Authenticates operators before redacted inspection or audited retry admission for an exact unknown Telegram delivery.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/telegram/delivery-control',
    httpMethod: 'POST',
    isAuthRequired: true,
    forwardedRequestHeaders: ['x-corgi-telegram-operator-secret'],
  },
});

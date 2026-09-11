import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import {
  type LogicFunctionExecutionContext,
  Response,
} from 'twenty-sdk/logic-function';

import { LOG_OUTREACH_FROM_COMPANY_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import { logOutreachForCompany } from 'src/modules/outreach/services/log-outreach-for-company.service';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYLOAD_KEYS = [
  'activityId',
  'companyId',
  'activityType',
  'outcome',
  'notes',
];

const readBody = (payload: unknown): Record<string, unknown> | undefined => {
  const body = (payload as { body?: unknown } | undefined)?.body ?? payload;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return body as Record<string, unknown>;
};

const optionalText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : undefined;

export const handleLogOutreachFromCompany = async (
  payload: unknown,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: {
    expectedWorkspaceId: string | undefined;
    now(): Date;
    createOutreachRepository(): Pick<CoreOutreachRepository, 'createActivity'>;
    createWholesalerRepository(): Pick<
      CoreWholesalerRepository,
      'findByWorkspaceMemberId'
    >;
  },
) => {
  const body = readBody(payload);
  const callerWorkspaceMemberId = context?.workspaceMemberId;
  if (
    !UUID_PATTERN.test(dependencies.expectedWorkspaceId ?? '') ||
    context?.workspaceId !== dependencies.expectedWorkspaceId ||
    !UUID_PATTERN.test(callerWorkspaceMemberId ?? '') ||
    !body ||
    Object.keys(body).some((key) => !PAYLOAD_KEYS.includes(key))
  ) {
    return new Response({ status: 'denied' }, { status: 403 });
  }

  // The caller is the server-injected identity, never a value from the body:
  // a form field naming someone else would otherwise log activity as them.
  const wholesalers = (
    await dependencies
      .createWholesalerRepository()
      .findByWorkspaceMemberId(callerWorkspaceMemberId!)
  ).filter(
    (wholesaler) => wholesaler.workspaceMemberId === callerWorkspaceMemberId,
  );
  if (wholesalers.length !== 1) {
    // Fail closed rather than write an unowned activity: an unresolved or
    // duplicated caller is a data fault to repair, not an owner to guess.
    return new Response({ status: 'caller_not_a_wholesaler' }, { status: 409 });
  }

  try {
    const result = await logOutreachForCompany({
      input: {
        activityId: String(body.activityId ?? ''),
        companyId: String(body.companyId ?? ''),
        activityType: String(body.activityType ?? ''),
        outcome: String(body.outcome ?? ''),
        ...(optionalText(body.notes) ? { notes: String(body.notes) } : {}),
      },
      wholesalerId: wholesalers[0]!.id,
      now: dependencies.now(),
      repository: dependencies.createOutreachRepository(),
    });
    return new Response(result, { status: 201 });
  } catch {
    // The message can name a rejected taxonomy value the caller supplied; the
    // shape of the refusal is all a form needs to correct itself.
    return new Response({ status: 'invalid_request' }, { status: 400 });
  }
};

export const handler = async (
  payload: RoutePayload,
  context?: LogicFunctionExecutionContext,
) =>
  handleLogOutreachFromCompany(payload, context, {
    expectedWorkspaceId: process.env.CORGI_CRM_WORKSPACE_ID?.trim(),
    now: () => new Date(),
    createOutreachRepository: () =>
      new CoreOutreachRepository(
        new CoreApiClient(),
        new RawCoreGraphqlTransport(),
      ),
    createWholesalerRepository: () =>
      new CoreWholesalerRepository(
        new CoreApiClient(),
        new RawCoreGraphqlTransport(),
      ),
  });

export default defineLogicFunction({
  universalIdentifier: LOG_OUTREACH_FROM_COMPANY_UNIVERSAL_IDENTIFIER,
  name: 'log-outreach-from-company',
  description:
    'Logs one outreach activity against an already-identified company, owned by the authenticated caller.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/outreach/log-from-company',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});

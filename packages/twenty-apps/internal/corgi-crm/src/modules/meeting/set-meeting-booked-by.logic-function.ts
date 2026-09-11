import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import {
  type LogicFunctionExecutionContext,
  Response,
} from 'twenty-sdk/logic-function';

import { SET_MEETING_BOOKED_BY_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreMeetingBookingRepository } from 'src/modules/meeting/graphql/core-meeting-booking.repository';
import { setMeetingBookedBy } from 'src/modules/meeting/services/set-meeting-booked-by.service';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYLOAD_KEYS = ['meetingId', 'bookedById'];

const readBody = (payload: unknown): Record<string, unknown> | undefined => {
  const body = (payload as { body?: unknown } | undefined)?.body ?? payload;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return body as Record<string, unknown>;
};

export const handleSetMeetingBookedBy = async (
  payload: unknown,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: {
    expectedWorkspaceId: string | undefined;
    createMeetingRepository(): {
      get(id: string): Promise<{ id: string } | null>;
      setBookedBy(input: { id: string; bookedById: string }): Promise<boolean>;
    };
    createMemberRepository(): {
      findWorkspaceMemberById(
        id: string,
      ): Promise<{ id: string; active: boolean } | null>;
    };
  },
) => {
  const body = readBody(payload);
  if (
    !UUID_PATTERN.test(dependencies.expectedWorkspaceId ?? '') ||
    context?.workspaceId !== dependencies.expectedWorkspaceId ||
    !UUID_PATTERN.test(context?.workspaceMemberId ?? '') ||
    !body ||
    Object.keys(body).some((key) => !PAYLOAD_KEYS.includes(key))
  ) {
    return new Response({ status: 'denied' }, { status: 403 });
  }

  // Any authenticated member may reattribute: booking on someone else's
  // behalf is the reason this exists. The caller identity still gates access,
  // it just does not constrain who the meeting can be attributed to.
  try {
    const result = await setMeetingBookedBy({
      meetingId: String(body.meetingId ?? ''),
      bookedById: String(body.bookedById ?? ''),
      meetingRepository: dependencies.createMeetingRepository(),
      memberRepository: dependencies.createMemberRepository(),
    });
    return new Response(result, {
      status: result.status === 'updated' ? 200 : 400,
    });
  } catch {
    return new Response({ status: 'not_persisted' }, { status: 503 });
  }
};

export const handler = async (
  payload: RoutePayload,
  context?: LogicFunctionExecutionContext,
) =>
  handleSetMeetingBookedBy(payload, context, {
    expectedWorkspaceId: process.env.CORGI_CRM_WORKSPACE_ID?.trim(),
    createMeetingRepository: () =>
      new CoreMeetingBookingRepository(new CoreApiClient()),
    createMemberRepository: () =>
      new CoreWholesalerRepository(
        new CoreApiClient(),
        new RawCoreGraphqlTransport(),
      ),
  });

export default defineLogicFunction({
  universalIdentifier: SET_MEETING_BOOKED_BY_UNIVERSAL_IDENTIFIER,
  name: 'set-meeting-booked-by',
  description:
    'Reattributes a meeting booking to a chosen workspace member, for bookings logged on someone else behalf.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/meeting/set-booked-by',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});

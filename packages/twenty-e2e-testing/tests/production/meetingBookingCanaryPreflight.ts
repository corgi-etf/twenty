const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MEETING_CANARY_ACTOR_IDENTITY_QUERY = `
  query ReadMeetingCanaryActorIdentity {
    currentUser {
      id
      currentWorkspace { id }
      currentUserWorkspace { id userId deletedAt isImpersonating }
      workspaceMember { id userWorkspaceId }
    }
  }
`;

export const MEETING_CANARY_MEMBERS_QUERY = `
  query FindMeetingCanaryActor {
    workspaceMembers(first: 100) {
      edges { node { id userId timeZone } }
    }
  }
`;

const requireRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Meeting canary identity response is malformed');
  }
  return value as Record<string, unknown>;
};

const requireUuid = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error('Meeting canary identity identifier is invalid');
  }
  return value;
};

export const resolveMeetingCanaryActor = ({
  identity,
  members,
  expectedWorkspaceId,
  expectedUserWorkspaceId,
}: {
  identity: unknown;
  members: unknown;
  expectedWorkspaceId: string;
  expectedUserWorkspaceId: string;
}) => {
  const user = requireRecord(requireRecord(identity).currentUser);
  const workspace = requireRecord(user.currentWorkspace);
  const membership = requireRecord(user.currentUserWorkspace);
  const authenticatedMember = requireRecord(user.workspaceMember);
  const userId = requireUuid(user.id);
  const workspaceMemberId = requireUuid(authenticatedMember.id);

  if (
    requireUuid(workspace.id) !== requireUuid(expectedWorkspaceId) ||
    requireUuid(membership.id) !== requireUuid(expectedUserWorkspaceId) ||
    membership.userId !== userId ||
    authenticatedMember.userWorkspaceId !== membership.id ||
    membership.deletedAt !== null ||
    (membership.isImpersonating !== false &&
      membership.isImpersonating !== null)
  ) {
    throw new Error('Meeting canary authenticated identity does not match');
  }

  const edges = requireRecord(requireRecord(members).workspaceMembers).edges;
  if (!Array.isArray(edges)) {
    throw new Error('Meeting canary workspace members response is malformed');
  }
  const workspaceMembers = edges.map((edge: unknown) => {
    const member = requireRecord(requireRecord(edge).node);
    const id = requireUuid(member.id);
    const memberUserId =
      member.userId === null ? null : requireUuid(member.userId);
    if (member.timeZone !== null && typeof member.timeZone !== 'string') {
      throw new Error('Meeting canary member time zone is malformed');
    }
    return { id, userId: memberUserId, timeZone: member.timeZone };
  });
  const actors = workspaceMembers.filter((member) => member.userId === userId);
  if (actors.length !== 1 || actors[0]?.id !== workspaceMemberId) {
    throw new Error(
      'Meeting canary actor does not match the authenticated member',
    );
  }
  const timeZone =
    actors[0].timeZone === 'system' ? 'UTC' : (actors[0].timeZone ?? 'UTC');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new Error('Meeting canary member time zone is invalid');
  }
  return { workspaceMemberId, workspaceMembers, timeZone };
};

type MeetingCanaryFailureCategory =
  | 'HTTP'
  | 'GRAPHQL_PERMISSION'
  | 'GRAPHQL_VALIDATION'
  | 'GRAPHQL_RECORD_NOT_FOUND'
  | 'GRAPHQL_OTHER'
  | 'MALFORMED_RESPONSE'
  | 'OWNERSHIP'
  | 'TIMEOUT'
  | 'ASSERTION'
  | 'UNKNOWN';

export class MeetingCanaryCheckError extends Error {
  constructor(readonly category: MeetingCanaryFailureCategory) {
    super(`Meeting canary check failed: ${category}`);
  }
}

export const meetingCanaryFailureCategory = (
  error: unknown,
): MeetingCanaryFailureCategory => {
  if (error instanceof MeetingCanaryCheckError) return error.category;
  if (error && typeof error === 'object') {
    if ('name' in error && error.name === 'TimeoutError') return 'TIMEOUT';
    if ('matcherResult' in error) return 'ASSERTION';
  }
  return 'UNKNOWN';
};

export const meetingCanaryGraphqlFailure = (
  errors: unknown,
): MeetingCanaryCheckError => {
  const codes = Array.isArray(errors)
    ? errors.map((error: unknown) => {
        if (!error || typeof error !== 'object' || !('extensions' in error))
          return null;
        const extensions = error.extensions;
        return extensions &&
          typeof extensions === 'object' &&
          'code' in extensions
          ? extensions.code
          : null;
      })
    : [];
  if (
    codes.some((code) =>
      ['FORBIDDEN', 'UNAUTHENTICATED', 'PERMISSION_DENIED'].includes(
        String(code),
      ),
    )
  )
    return new MeetingCanaryCheckError('GRAPHQL_PERMISSION');
  if (codes.includes('GRAPHQL_VALIDATION_FAILED'))
    return new MeetingCanaryCheckError('GRAPHQL_VALIDATION');
  if (codes.includes('NOT_FOUND') || codes.includes('RECORD_NOT_FOUND'))
    return new MeetingCanaryCheckError('GRAPHQL_RECORD_NOT_FOUND');
  return new MeetingCanaryCheckError('GRAPHQL_OTHER');
};

export type MeetingCanaryCalendarEvidence = {
  httpStatus: number;
  category: MeetingCanaryFailureCategory | 'OK';
  groupCount: number;
  edgeCount: number;
  targetPresent: boolean;
  targetWithinFirstFive: boolean;
};

type CalendarResponse = {
  url(): string;
  request(): { method(): string; postDataJSON(): unknown };
  status(): number;
  json(): Promise<unknown>;
};

const calendarObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Observability only: never retain a request, response, name, record ID or error
// message. Unrelated requests are rejected before their response body is read.
export const inspectMeetingCanaryCalendarResponse = async (
  response: CalendarResponse,
  approvedOrigin: string,
  targetId: string,
): Promise<MeetingCanaryCalendarEvidence | null> => {
  try {
    const url = new URL(response.url());
    const request = response.request();
    if (
      url.origin !== approvedOrigin ||
      url.pathname !== '/graphql' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      request.method() !== 'POST' ||
      !UUID_PATTERN.test(targetId)
    )
      return null;
    const postData = request.postDataJSON();
    if (
      !calendarObject(postData) ||
      postData.operationName !== 'GroupByMeetingBookings'
    )
      return null;
  } catch {
    return null;
  }

  const evidence: MeetingCanaryCalendarEvidence = {
    httpStatus: 0,
    category: 'MALFORMED_RESPONSE',
    groupCount: 0,
    edgeCount: 0,
    targetPresent: false,
    targetWithinFirstFive: false,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = response.status();
    if (!Number.isInteger(status) || status < 100 || status > 599)
      return evidence;
    evidence.httpStatus = status;
    if (status < 200 || status >= 300) {
      evidence.category = 'HTTP';
      return evidence;
    }
    const body = await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new MeetingCanaryCheckError('TIMEOUT')),
          5_000,
        );
      }),
    ]);
    if (!calendarObject(body)) return evidence;
    if (
      Array.isArray(body.errors) ? body.errors.length > 0 : Boolean(body.errors)
    ) {
      evidence.category = meetingCanaryGraphqlFailure(body.errors).category;
      return evidence;
    }
    if (!calendarObject(body.data)) return evidence;
    const groups = body.data.meetingBookingsGroupBy;
    if (!Array.isArray(groups)) return evidence;
    evidence.groupCount = Math.min(groups.length, 1000);
    if (groups.length > 1000) return evidence;
    let targetPresent = false;
    let targetWithinFirstFive = false;
    for (const group of groups) {
      if (!calendarObject(group) || !Array.isArray(group.edges))
        return evidence;
      const edgeCount = evidence.edgeCount + group.edges.length;
      evidence.edgeCount = Math.min(edgeCount, 10_000);
      if (edgeCount > 10_000) return evidence;
      for (const [index, edge] of group.edges.entries()) {
        if (
          !calendarObject(edge) ||
          !calendarObject(edge.node) ||
          typeof edge.node.id !== 'string' ||
          !UUID_PATTERN.test(edge.node.id)
        )
          return evidence;
        if (edge.node.id === targetId) {
          targetPresent = true;
          if (index < 5) targetWithinFirstFive = true;
        }
      }
    }
    evidence.category = 'OK';
    evidence.targetPresent = targetPresent;
    evidence.targetWithinFirstFive = targetWithinFirstFive;
  } catch (error) {
    evidence.category =
      error instanceof MeetingCanaryCheckError
        ? error.category
        : 'MALFORMED_RESPONSE';
  } finally {
    if (timer) clearTimeout(timer);
  }
  return evidence;
};

export type MeetingCanaryRecord = {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { workspaceMemberId: string | null };
  companyId: string | null;
  wholesalerId: string | null;
  scheduledAt: string | null;
  status: string;
  bookedAt: string | null;
  bookedById: string | null;
  bookingValidationMessage: string | null;
};

const nullableUuid = (value: unknown) =>
  value === null || (typeof value === 'string' && UUID_PATTERN.test(value));
const nullableText = (value: unknown) =>
  value === null || typeof value === 'string';
const validTimestamp = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

export const meetingCanaryRecords = (
  response: unknown,
): MeetingCanaryRecord[] => {
  try {
    const edges = requireRecord(requireRecord(response).meetingBookings).edges;
    if (!Array.isArray(edges) || edges.length > 2) throw new Error();
    return edges.map((edge: unknown) => {
      const record = requireRecord(requireRecord(edge).node);
      const actor = requireRecord(record.createdBy);
      if (
        !UUID_PATTERN.test(String(record.id)) ||
        !nullableText(record.name) ||
        !validTimestamp(record.createdAt) ||
        !validTimestamp(record.updatedAt) ||
        !nullableUuid(actor.workspaceMemberId) ||
        !nullableUuid(record.companyId) ||
        !nullableUuid(record.wholesalerId) ||
        !nullableUuid(record.bookedById) ||
        !nullableText(record.bookingValidationMessage) ||
        !(record.scheduledAt === null || validTimestamp(record.scheduledAt)) ||
        !(record.bookedAt === null || validTimestamp(record.bookedAt)) ||
        !['DRAFT', 'BOOKED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(
          String(record.status),
        )
      )
        throw new Error();
      return record as MeetingCanaryRecord;
    });
  } catch {
    throw new MeetingCanaryCheckError('MALFORMED_RESPONSE');
  }
};

export const resolveMeetingCanaryRecord = (
  response: unknown,
  expectedId: string,
): MeetingCanaryRecord | null => {
  const records = meetingCanaryRecords(response);
  if (
    !UUID_PATTERN.test(expectedId) ||
    records.length > 1 ||
    records.some((record) => record.id !== expectedId)
  ) {
    throw new MeetingCanaryCheckError('OWNERSHIP');
  }
  return records[0] ?? null;
};

export type MeetingCanaryRecovery = {
  runId: string;
  attempt: string;
  createdAfter: string;
  createdBefore: string;
};

export const parseMeetingCanaryRecovery = (
  environment: Record<string, string | undefined>,
): MeetingCanaryRecovery | null => {
  const values = [
    'RUN_ID',
    'RUN_ATTEMPT',
    'CREATED_AFTER',
    'CREATED_BEFORE',
    'CONFIRMATION',
  ].map(
    (key) => environment[`CRM_MEETING_CANARY_RECOVERY_${key}`]?.trim() ?? '',
  );
  if (values.every((value) => value === '')) return null;
  const [runId, attempt, createdAfter, createdBefore, confirmation] = values;
  const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const after = Date.parse(createdAfter ?? '');
  const before = Date.parse(createdBefore ?? '');
  if (
    !runId ||
    !/^[1-9]\d{0,19}$/.test(runId) ||
    !attempt ||
    !/^[1-9]\d{0,5}$/.test(attempt) ||
    !createdAfter ||
    !utcTimestamp.test(createdAfter) ||
    !createdBefore ||
    !utcTimestamp.test(createdBefore) ||
    !Number.isFinite(after) ||
    !Number.isFinite(before) ||
    before <= after ||
    before - after > 20 * 60_000 ||
    confirmation !== 'CLEANUP_RUN_OWNED_MEETING'
  )
    throw new MeetingCanaryCheckError('OWNERSHIP');
  return { runId, attempt, createdAfter, createdBefore };
};

export const validateMeetingCanaryRecoveryRecord = (
  record: MeetingCanaryRecord,
  recovery: MeetingCanaryRecovery,
  authenticatedMemberId: string,
) => {
  const prefix = `CRM meeting canary ${recovery.runId}-${recovery.attempt}-`;
  const createdAt = Date.parse(record.createdAt);
  const updatedAt = Date.parse(record.updatedAt);
  if (
    !UUID_PATTERN.test(record.id) ||
    !UUID_PATTERN.test(authenticatedMemberId) ||
    typeof record.name !== 'string' ||
    !record.name.startsWith(prefix) ||
    !UUID_PATTERN.test(record.name.slice(prefix.length)) ||
    record.createdBy.workspaceMemberId !== authenticatedMemberId ||
    !Number.isFinite(createdAt) ||
    createdAt < Date.parse(recovery.createdAfter) ||
    createdAt >= Date.parse(recovery.createdBefore) ||
    !Number.isFinite(updatedAt) ||
    updatedAt < createdAt ||
    updatedAt >= Date.parse(recovery.createdBefore)
  ) {
    throw new MeetingCanaryCheckError('OWNERSHIP');
  }
};

export const createMeetingCanaryReceipt = ({
  runId,
  attempt,
  meetingId,
  nameNonce,
  creationRequestedAt,
}: {
  runId: string;
  attempt: string;
  meetingId: string;
  nameNonce: string;
  creationRequestedAt: number;
}) => {
  if (
    !/^[1-9]\d{0,19}$/.test(runId) ||
    !/^[1-9]\d{0,5}$/.test(attempt) ||
    !UUID_PATTERN.test(meetingId) ||
    !UUID_PATTERN.test(nameNonce) ||
    !Number.isFinite(creationRequestedAt)
  ) {
    throw new MeetingCanaryCheckError('MALFORMED_RESPONSE');
  }
  return {
    runId,
    attempt,
    meetingId,
    nameNonce,
    creationRequestedAt: new Date(creationRequestedAt).toISOString(),
  };
};

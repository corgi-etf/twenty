import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const APPLICATION_ID = 'ca87ad48-b62a-41be-a790-7c17707ff1b4';
const TRIGGER_ID = '65f68f6b-e130-4292-ab05-3ef48458d7de';
const TELEGRAM_WEBHOOK_ID = 'a7693988-ab2a-4f07-b865-b4d4808c814a';
const TELEGRAM_WORKER_ID = '32cf139c-a4bf-4d87-84f4-f70ac39a3942';
const TELEGRAM_CRON_ID = 'e61bb12c-a0f5-421b-97d2-e2596e56cf59';
const TELEGRAM_DAILY_WORKER_ID = 'a518c1f8-d80c-4260-8ef6-bd51a86b4eda';
const TELEGRAM_DELIVERY_CONTROL_ID = 'c77df778-3268-4d34-a3d8-84e7478cb567';
const TELEGRAM_DELIVERY_RETRY_WORKER_ID =
  '70e86a19-fbdd-4d17-aa36-f0b2ab62305b';
const MEETING_BOOKING_OBJECT_ID = '0b252d63-b1de-464d-930e-1c1fb6a7eaee';
const MEETING_BOOKING_ALL_VIEW_ID = '1b8237a7-2e7a-454e-925a-68390abb2992';
const MEETING_BOOKING_CALENDAR_VIEW_ID =
  '64fbb44e-e7cf-4fd3-a3b3-44af2beb9ac9';
const MEETING_BOOKING_FIELDS_VIEW_ID =
  '66755b49-ef0f-4f93-811e-d15a50bf0206';
const MEETING_BOOKING_RECORD_PAGE_ID =
  'f3af6625-cb1a-41f0-94da-4b11b6ff2ac1';
const MEETING_BOOKING_CREATED_FUNCTION_ID =
  'a0b07c49-e3d1-48fa-9827-9ab9f564b1d1';
const MEETING_BOOKING_STATUS_FUNCTION_ID =
  '3d425836-d5e6-4c37-9609-d9580b700c6c';
const MEETING_BOOKED_ALERT_FUNCTION_ID =
  '4d407d33-c0b2-4f8e-8300-be86c2e3dc7d';
const MEETING_NOTIFICATION_WORKER_ID =
  'fb84094f-d44a-4180-9f50-ff7971f670e6';
const REPORT_RUNTIME_VERIFICATION_ID =
  '8d6ea72a-aa6f-4a1c-83a7-ad539819bd47';
const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

// Only this fixed vocabulary may reach CI logs. Server messages, paths,
// extensions, query variables, and partial response data may contain CRM PII.
const GRAPHQL_ERROR_CODES = new Set([
  'GRAPHQL_PARSE_FAILED', 'GRAPHQL_VALIDATION_FAILED', 'UNAUTHENTICATED',
  'FORBIDDEN', 'BAD_USER_INPUT', 'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'CONFLICT',
  'TIMEOUT', 'INTERNAL_SERVER_ERROR', 'METADATA_VALIDATION_FAILED',
  'APPLICATION_INSTALLATION_FAILED', 'RATE_LIMITED', 'QUOTA_EXHAUSTED',
]);

// Selected machine enums from the server query-runner and TwentyOrm exceptions.
// Arbitrary extension subcodes must not become another route for PII into logs.
const GRAPHQL_ERROR_SUBCODES = new Set([
  'INVALID_QUERY_INPUT', 'INVALID_ARGS_FILTER', 'FIELD_NOT_FOUND',
  'OBJECT_METADATA_NOT_FOUND', 'RELATION_SETTINGS_NOT_FOUND',
  'RELATION_TARGET_OBJECT_METADATA_NOT_FOUND', 'UNSUPPORTED_OPERATOR',
  'MALFORMED_METADATA', 'INVALID_INPUT', 'UNKNOWN_COLUMN', 'UNKNOWN_RELATION',
  'UNKNOWN_OBJECT', 'MALFORMED_SQL', 'INVALID_QUERY', 'INVALID_PARAMETER',
  'MISSING_PARAMETER', 'WORKSPACE_SCHEMA_NOT_FOUND', 'RLS_VALIDATION_FAILED',
  'NO_ROLE_FOUND_FOR_USER_WORKSPACE', 'ROLES_PERMISSIONS_VERSION_NOT_FOUND',
  'API_KEY_ROLE_MAP_VERSION_NOT_FOUND', 'UNKNOWN_METHOD', 'INVALID_RESULT_TYPE',
  'NOT_IMPLEMENTED', 'QUERY_READ_TIMEOUT', 'TRANSIENT_DATABASE_ERROR',
]);

const classifyGraphqlError = (error) => {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/Variable .* of type .* used in position expecting type/i.test(message)) {
    return 'schema_variable_type_mismatch';
  }
  if (/Cannot query field|Field .* is not defined by type/i.test(message)) {
    return 'schema_unknown_field';
  }
  if (/Unknown type/i.test(message)) return 'schema_unknown_type';
  if (/permission denied|not authorized|unauthenticated|forbidden/i.test(message)) {
    return 'permission_denied';
  }
  if (/duplicate key|unique constraint|foreign key constraint/i.test(message)) {
    return 'constraint_conflict';
  }
  if (/\bcolumn\b.*\bdoes not exist\b/i.test(message)) {
    return 'database_missing_column';
  }
  if (/\brelation\b.*\bdoes not exist\b/i.test(message)) {
    return 'database_missing_relation';
  }
  if (/operator does not exist/i.test(message)) {
    return 'database_operator_type_mismatch';
  }
  if (/invalid input syntax for type/i.test(message)) {
    return 'database_value_type_mismatch';
  }
  if (/invalid filter|filter .* invalid|invalid argument: "filter"/i.test(message)) {
    return 'invalid_filter';
  }
  return 'unexpected';
};

const summarizeGraphqlErrors = (errors) => {
  const counts = new Map();
  for (const error of errors) {
    const code = GRAPHQL_ERROR_CODES.has(error?.extensions?.code)
      ? error.extensions.code : 'UNKNOWN';
    const subCode = GRAPHQL_ERROR_SUBCODES.has(error?.extensions?.subCode)
      ? `/${error.extensions.subCode}` : '';
    const key = `${code}${subCode}/${classifyGraphqlError(error)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`).join(', ');
};

class VerificationGraphqlError extends Error {
  constructor(operationName, rawErrors) {
    const safeDiagnostics = summarizeGraphqlErrors(
      Array.isArray(rawErrors) && rawErrors.length > 0 ? rawErrors : [null],
    );
    super(`${operationName} returned GraphQL errors: ${safeDiagnostics}`);
    this.name = 'VerificationGraphqlError';
    this.operationName = operationName;
    this.safeDiagnostics = safeDiagnostics;
  }
}

const parseResponse = async (response, operationName) => {
  if (!response.ok) {
    throw new Error(`${operationName} failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new VerificationGraphqlError(operationName, body.errors);
  }
  if (!body.data) throw new Error(`${operationName} returned no data`);
  return body.data;
};

const createGraphqlClient =
  ({ origin, apiKey }) =>
  async ({ endpoint, operationName, query, variables = {} }) =>
    parseResponse(
      await fetch(new URL(endpoint, origin), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Origin: origin,
        },
        body: JSON.stringify({ operationName, query, variables }),
        redirect: 'error',
      }),
      operationName,
    );

const verifyTargetWorkspace = async ({ graphql, expectedWorkspaceId }) => {
  const data = await graphql({
    endpoint: '/metadata',
    operationName: 'VerifyCorgiCrmTargetWorkspace',
    query: `query VerifyCorgiCrmTargetWorkspace {
      currentWorkspace { id }
    }`,
  });
  if (data.currentWorkspace?.id !== expectedWorkspaceId) {
    throw new Error(
      'Authenticated credential is not scoped to the approved workspace',
    );
  }
};

const verifyRequiredSchema = async ({ graphql }) => {
  const data = await graphql({
    endpoint: '/graphql',
    operationName: 'VerifyCorgiCrmRequiredSchema',
    query: `query VerifyCorgiCrmRequiredSchema {
      workspaceMembers(first: 1) {
        edges { node { id userEmail name { firstName lastName } } }
      }
      wholesalers(first: 1) {
        edges { node { id name email wholesalerRole workspaceMemberId } }
      }
    }`,
  });
  if (!data.workspaceMembers?.edges || !data.wholesalers?.edges) {
    throw new Error('Required Corgi CRM core schema is unavailable');
  }
};

const parseTriggerSettings = (settings) => {
  if (typeof settings !== 'string') return settings;
  try {
    return JSON.parse(settings);
  } catch {
    return null;
  }
};

const TELEGRAM_VARIABLE_KEYS = [
  'CORGI_CRM_TELEGRAM_BOT_TOKEN',
  'CORGI_CRM_TELEGRAM_WEBHOOK_SECRET',
  'CORGI_CRM_TELEGRAM_OPERATOR_SECRET',
  'CORGI_CRM_TELEGRAM_LINK_CODES',
  'CORGI_CRM_TELEGRAM_TIME_ZONE',
  'CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME',
  'CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES',
];

const exactlyOne = (values, predicate, label) => {
  const matches = values.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${matches.length}`);
  }
  return matches[0];
};

const assertIanaTimeZone = (value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    throw new Error('Telegram time zone must be a valid IANA zone');
  }
};

const assertQuarterHour = (value) => {
  const match = /^(?:[01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (!match || Number(match[1]) % 15 !== 0) {
    throw new Error('Telegram summary time must be on a 15-minute boundary');
  }
};

const resolveCorgiRoleObjectIdentifiers = (objects) => {
  const resolve = (nameSingular, environmentKey) => {
    const object = exactlyOne(
      objects,
      (candidate) =>
        candidate?.nameSingular === nameSingular && candidate.isActive === true,
      `${nameSingular} metadata object`,
    );
    if (!UUID_PATTERN.test(object.universalIdentifier ?? '')) {
      throw new Error(`${nameSingular} object universal identifier is not a UUID`);
    }
    return [environmentKey, object.universalIdentifier];
  };
  return Object.fromEntries([
    resolve(
      'wholesaler',
      'CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER',
    ),
    resolve(
      'outreachActivity',
      'CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER',
    ),
  ]);
};

const verifyApplicationRoleContract = (role, objects) => {
  if (!role || typeof role !== 'object') {
    throw new Error('Installed application role is missing');
  }
  if (
    role.canAccessAllTools !== false ||
    role.canBeAssignedToUsers !== false ||
    role.canBeAssignedToAgents !== false ||
    role.canBeAssignedToApiKeys !== false ||
    role.canReadAllObjectRecords !== false ||
    role.canUpdateAllObjectRecords !== false ||
    role.canSoftDeleteAllObjectRecords !== false ||
    role.canDestroyAllObjectRecords !== false ||
    role.canUpdateAllSettings !== false
  ) {
    throw new Error(
      'Installed application role has a global, tool, or assignment capability',
    );
  }
  for (const collection of [
    'permissionFlags',
    'fieldPermissions',
    'rowLevelPermissionPredicates',
    'rowLevelPermissionPredicateGroups',
    'workspaceMembers',
    'agents',
    'apiKeys',
  ]) {
    if (!Array.isArray(role[collection]) || role[collection].length !== 0) {
      throw new Error(
        `Installed application role ${collection} collection must be present and empty`,
      );
    }
  }
  const permissions = role.objectPermissions ?? [];
  if (permissions.length !== 8) {
    throw new Error(
      'Installed application role must have exactly eight object permissions',
    );
  }
  const expected = new Map(
    [
      ['workspaceMember', false],
      ['company', false],
      ['person', false],
      ['wholesaler', true],
      ['outreachActivity', true],
      ['telegramDelivery', true],
      ['telegramDeliveryAudit', true],
      ['meetingBooking', true],
    ].map(([nameSingular, writable]) => {
      const object = exactlyOne(
        objects,
        (candidate) => candidate?.nameSingular === nameSingular,
        `${nameSingular} metadata object`,
      );
      return [object.id, { nameSingular, writable }];
    }),
  );
  const seen = new Set();
  for (const permission of permissions) {
    const contract = expected.get(permission.objectMetadataId);
    if (!contract || seen.has(permission.objectMetadataId)) {
      throw new Error('Installed application role has an unexpected object permission');
    }
    seen.add(permission.objectMetadataId);
    if (
      permission.canReadObjectRecords !== true ||
      permission.canUpdateObjectRecords !== contract.writable ||
      permission.canSoftDeleteObjectRecords !== false ||
      permission.canDestroyObjectRecords !== false
    ) {
      throw new Error(
        `Installed application role has excessive ${contract.nameSingular} permission`,
      );
    }
  }
};

const parseJsonValue = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const verifyMeetingBookingSchema = (objects, experience) => {
  const object = exactlyOne(
    objects,
    (candidate) =>
      candidate?.nameSingular === 'meetingBooking' &&
      candidate.isActive === true &&
      candidate.universalIdentifier === MEETING_BOOKING_OBJECT_ID,
    'meetingBooking metadata object',
  );
  const fields = object.fieldsList ?? [];
  const requiredFields = {
    name: 'TEXT',
    scheduledAt: 'DATE_TIME',
    status: 'SELECT',
    bookedAt: 'DATE_TIME',
    notes: 'RICH_TEXT',
    bookingValidationMessage: 'TEXT',
    company: 'RELATION',
    wholesaler: 'RELATION',
    bookedBy: 'RELATION',
  };
  const fieldByName = new Map();
  for (const [name, type] of Object.entries(requiredFields)) {
    const field = exactlyOne(
      fields,
      (candidate) => candidate?.name === name && candidate.isActive !== false,
      `meetingBooking.${name} field`,
    );
    if (field.type !== type) {
      throw new Error(`meetingBooking.${name} field has an invalid type`);
    }
    fieldByName.set(name, field);
  }
  for (const name of ['bookedAt', 'bookedBy', 'bookingValidationMessage']) {
    const field = fieldByName.get(name);
    if (
      field.writability !== 'APPLICATION' ||
      field.isUIEditable !== false
    ) {
      throw new Error(`meetingBooking.${name} writability is not protected`);
    }
  }
  const statusOptions = parseJsonValue(fieldByName.get('status').options);
  if (
    !Array.isArray(statusOptions) ||
    statusOptions.map((option) => option?.value).join(',') !==
      'DRAFT,BOOKED,COMPLETED,CANCELLED,NO_SHOW'
  ) {
    throw new Error('meetingBooking status options are invalid');
  }
  for (const [fieldName, targetName] of [
    ['company', 'company'],
    ['wholesaler', 'wholesaler'],
    ['bookedBy', 'workspaceMember'],
  ]) {
    if (
      fieldByName.get(fieldName).relation?.targetObjectMetadata
        ?.nameSingular !== targetName
    ) {
      throw new Error(`meetingBooking.${fieldName} relation is invalid`);
    }
  }

  const view = (universalIdentifier, label) =>
    exactlyOne(
      experience.views ?? [],
      (candidate) =>
        candidate?.universalIdentifier === universalIdentifier &&
        candidate.objectMetadataId === object.id &&
        candidate.isActive === true,
      label,
    );
  if (view(MEETING_BOOKING_ALL_VIEW_ID, 'meeting table view').type !== 'TABLE') {
    throw new Error('Meeting table view is invalid');
  }
  const calendar = view(
    MEETING_BOOKING_CALENDAR_VIEW_ID,
    'meeting calendar view',
  );
  if (
    calendar.type !== 'CALENDAR' ||
    calendar.calendarLayout !== 'MONTH' ||
    calendar.calendarFieldMetadataId !== fieldByName.get('scheduledAt').id
  ) {
    throw new Error('Meeting calendar view is invalid');
  }
  const fieldsView = view(
    MEETING_BOOKING_FIELDS_VIEW_ID,
    'meeting fields view',
  );
  if (
    fieldsView.type !== 'FIELDS_WIDGET' ||
    !(fieldsView.viewFields ?? []).some(
      (candidate) =>
        candidate?.fieldMetadataId ===
          fieldByName.get('bookingValidationMessage').id &&
        candidate.isActive !== false,
    )
  ) {
    throw new Error('Meeting fields view does not expose booking feedback');
  }
  const pageLayout = exactlyOne(
    experience.pageLayouts ?? [],
    (candidate) =>
      candidate?.universalIdentifier === MEETING_BOOKING_RECORD_PAGE_ID &&
      candidate.objectMetadataId === object.id,
    'meeting record page',
  );
  if (
    pageLayout.type !== 'RECORD_PAGE' ||
    !(pageLayout.tabs ?? []).some((tab) =>
      (tab.widgets ?? []).some(
        (widget) => widget?.type === 'FIELDS' && widget.isActive !== false,
      ),
    )
  ) {
    throw new Error('Meeting record page is invalid');
  }
};

const exactDatabaseTrigger = ({ application, id, name, settings, label }) => {
  const logicFunction = exactlyOne(
    application.logicFunctions ?? [],
    (candidate) => candidate?.universalIdentifier === id,
    label,
  );
  if (
    logicFunction.name !== name ||
    JSON.stringify(parseTriggerSettings(logicFunction.databaseEventTriggerSettings)) !==
      JSON.stringify(settings)
  ) {
    throw new Error(`${label} database trigger is invalid`);
  }
};

const verifyMeetingApplicationContract = (application) => {
  exactDatabaseTrigger({
    application,
    id: MEETING_BOOKING_CREATED_FUNCTION_ID,
    name: 'on-meeting-booking-created',
    settings: { eventName: 'meetingBooking.created' },
    label: 'Meeting create reconciliation',
  });
  exactDatabaseTrigger({
    application,
    id: MEETING_BOOKING_STATUS_FUNCTION_ID,
    name: 'on-meeting-booking-status-updated',
    settings: {
      eventName: 'meetingBooking.updated',
      updatedFields: ['status'],
    },
    label: 'Meeting status reconciliation',
  });
  exactDatabaseTrigger({
    application,
    id: MEETING_BOOKED_ALERT_FUNCTION_ID,
    name: 'telegram-meeting-booked-alert',
    settings: {
      eventName: 'meetingBooking.updated',
      updatedFields: ['bookedAt'],
    },
    label: 'Meeting booked alert',
  });
  const worker = exactlyOne(
    application.logicFunctions ?? [],
    (candidate) => candidate?.universalIdentifier === MEETING_NOTIFICATION_WORKER_ID,
    'Meeting notification worker',
  );
  if (
    worker.name !== 'telegram-notification-delivery-worker' ||
    worker.databaseEventTriggerSettings != null ||
    worker.httpRouteTriggerSettings != null ||
    worker.cronTriggerSettings != null
  ) {
    throw new Error('Meeting notification worker must be untriggered');
  }
  const reportVerifier = exactlyOne(
    application.logicFunctions ?? [],
    (candidate) => candidate?.universalIdentifier === REPORT_RUNTIME_VERIFICATION_ID,
    'Report runtime verification function',
  );
  if (
    reportVerifier.name !== 'verify-report-runtime' ||
    [
      'databaseEventTriggerSettings',
      'httpRouteTriggerSettings',
      'cronTriggerSettings',
      'toolTriggerSettings',
      'workflowActionTriggerSettings',
    ].some((key) => reportVerifier[key] != null)
  ) {
    throw new Error('Report runtime verification function must be untriggered');
  }
};

const TELEGRAM_PERSISTENCE_OBJECTS = {
  telegramDelivery: {
    fields: {
      name: 'TEXT',
      deliveryKey: 'TEXT',
      operationDigest: 'TEXT',
      status: 'SELECT',
      stateToken: 'TEXT',
      attempts: 'NUMBER',
      resetCount: 'NUMBER',
      unknownAt: 'DATE_TIME',
      lastReasonCode: 'SELECT',
      retryRequestId: 'TEXT',
      approvedUnknownAt: 'DATE_TIME',
    },
    uniqueIndexes: [['deliveryKey']],
  },
  telegramDeliveryAudit: {
    fields: {
      name: 'TEXT',
      requestId: 'TEXT',
      deliveryKey: 'TEXT',
      expectedUnknownAt: 'DATE_TIME',
      actorWorkspaceMemberId: 'TEXT',
      reasonDigest: 'TEXT',
      requestedAt: 'DATE_TIME',
    },
    uniqueIndexes: [['requestId'], ['deliveryKey', 'expectedUnknownAt']],
  },
};

const verifyTelegramPersistenceSchema = (objects) => {
  for (const [nameSingular, contract] of Object.entries(
    TELEGRAM_PERSISTENCE_OBJECTS,
  )) {
    const object = exactlyOne(
      objects,
      (candidate) =>
        candidate?.nameSingular === nameSingular && candidate.isActive === true,
      `${nameSingular} metadata object`,
    );
    const fields = object.fieldsList ?? [];
    const fieldByName = new Map();
    for (const [name, type] of Object.entries(contract.fields)) {
      const field = exactlyOne(
        fields,
        (candidate) => candidate?.name === name && candidate.isActive !== false,
        `${nameSingular}.${name} field`,
      );
      if (field.type !== type) {
        throw new Error(`${nameSingular}.${name} field has an invalid type`);
      }
      fieldByName.set(name, field);
    }

    const uniqueIndexes = (object.indexMetadataList ?? []).filter(
      (index) => index?.isUnique === true,
    );
    if (uniqueIndexes.length !== contract.uniqueIndexes.length) {
      throw new Error(
        `${nameSingular} has an unexpected number of unique indexes`,
      );
    }
    const actualIndexSignatures = uniqueIndexes.map((index) =>
      (index.indexFieldMetadataList ?? [])
        .toSorted((left, right) => left.order - right.order)
        .map((indexField) => indexField.fieldMetadataId)
        .join(','),
    );
    for (const fieldNames of contract.uniqueIndexes) {
      const expectedSignature = fieldNames
        .map((name) => fieldByName.get(name)?.id)
        .join(',');
      if (
        !expectedSignature ||
        actualIndexSignatures.filter(
          (signature) => signature === expectedSignature,
        ).length !== 1
      ) {
        throw new Error(
          `${nameSingular} is missing its unique ${fieldNames.join(', ')} index`,
        );
      }
    }
  }
};

const verifyTelegramApplicationContract = (application, workspaceId) => {
  const variables = application.applicationVariables ?? [];
  const workspaceVariable = exactlyOne(
    variables,
    (variable) => variable.key === 'CORGI_CRM_WORKSPACE_ID',
    'workspace variable',
  );
  if (workspaceVariable.value !== workspaceId) {
    throw new Error('Telegram application workspace variable is incorrect');
  }
  const enabledVariable = exactlyOne(
    variables,
    (variable) => variable.key === 'CORGI_CRM_TELEGRAM_ENABLED',
    'Telegram enabled variable',
  );
  if (enabledVariable.value !== 'true') {
    throw new Error('Telegram application is not enabled');
  }
  for (const key of TELEGRAM_VARIABLE_KEYS) {
    const variable = exactlyOne(
      variables,
      (candidate) => candidate.key === key,
      `Telegram variable ${key}`,
    );
    if (typeof variable.value !== 'string' || !variable.value.trim()) {
      throw new Error(`Telegram variable ${key} is not configured`);
    }
  }
  const variableValue = (key) =>
    exactlyOne(
      variables,
      (candidate) => candidate.key === key,
      `Telegram variable ${key}`,
    ).value.trim();
  assertIanaTimeZone(variableValue('CORGI_CRM_TELEGRAM_TIME_ZONE'));
  assertQuarterHour(
    variableValue('CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME'),
  );

  const functions = application.logicFunctions ?? [];
  const webhook = exactlyOne(
    functions,
    (logicFunction) =>
      logicFunction.universalIdentifier === TELEGRAM_WEBHOOK_ID,
    'Telegram webhook function',
  );
  const webhookSettings = parseTriggerSettings(
    webhook.httpRouteTriggerSettings,
  );
  if (
    webhookSettings?.path !== '/telegram/webhook' ||
    webhookSettings?.httpMethod !== 'POST' ||
    webhookSettings?.isAuthRequired !== false ||
    !Array.isArray(webhookSettings?.forwardedRequestHeaders) ||
    webhookSettings.forwardedRequestHeaders.length !== 1 ||
    webhookSettings.forwardedRequestHeaders[0]?.toLowerCase() !==
      'x-telegram-bot-api-secret-token'
  ) {
    throw new Error(
      'Telegram webhook route/header forwarding contract is not active',
    );
  }

  exactlyOne(
    functions,
    (logicFunction) =>
      logicFunction.universalIdentifier === TELEGRAM_WORKER_ID,
    'Telegram queued worker function',
  );
  const cron = exactlyOne(
    functions,
    (logicFunction) => logicFunction.universalIdentifier === TELEGRAM_CRON_ID,
    'Telegram cron function',
  );
  const cronSettings = parseTriggerSettings(cron.cronTriggerSettings);
  if (cronSettings?.pattern !== '*/15 * * * *') {
    throw new Error('Telegram cron contract is not active');
  }
  exactlyOne(
    functions,
    (logicFunction) =>
      logicFunction.universalIdentifier === TELEGRAM_DAILY_WORKER_ID,
    'Telegram daily queued worker function',
  );
  const deliveryControl = exactlyOne(
    functions,
    (logicFunction) =>
      logicFunction.universalIdentifier === TELEGRAM_DELIVERY_CONTROL_ID,
    'Telegram delivery control function',
  );
  const deliveryControlSettings = parseTriggerSettings(
    deliveryControl.httpRouteTriggerSettings,
  );
  if (
    deliveryControlSettings?.path !== '/telegram/delivery-control' ||
    deliveryControlSettings?.httpMethod !== 'POST' ||
    deliveryControlSettings?.isAuthRequired !== true ||
    deliveryControlSettings?.forwardedRequestHeaders?.length !== 1 ||
    deliveryControlSettings.forwardedRequestHeaders[0]?.toLowerCase() !==
      'x-corgi-telegram-operator-secret'
  ) {
    throw new Error('Telegram delivery control route contract is not active');
  }
  exactlyOne(
    functions,
    (logicFunction) =>
      logicFunction.universalIdentifier ===
      TELEGRAM_DELIVERY_RETRY_WORKER_ID,
    'Telegram delivery retry worker function',
  );
};

const verifyTelegramDisabled = (application, workspaceId) => {
  const variables = application.applicationVariables ?? [];
  const workspaceVariable = exactlyOne(
    variables,
    (variable) => variable.key === 'CORGI_CRM_WORKSPACE_ID',
    'workspace variable',
  );
  if (workspaceVariable.value !== workspaceId) {
    throw new Error('Telegram application workspace variable is incorrect');
  }
  const enabledVariable = exactlyOne(
    variables,
    (variable) => variable.key === 'CORGI_CRM_TELEGRAM_ENABLED',
    'Telegram enabled variable',
  );
  if (enabledVariable.value !== 'false') {
    throw new Error('Telegram application is not disabled');
  }
};

const verifyInstalledApplication = async ({
  graphql,
  version,
  workspaceId,
}) => {
  const data = await graphql({
    endpoint: '/metadata',
    operationName: 'VerifyCorgiCrmInstalledApplication',
    query: `query VerifyCorgiCrmInstalledApplication {
      currentWorkspace { id }
      findManyApplications {
        universalIdentifier version state
        applicationVariables { key value }
        defaultLogicFunctionRole {
          canAccessAllTools
          canBeAssignedToUsers
          canBeAssignedToAgents
          canBeAssignedToApiKeys
          canReadAllObjectRecords
          canUpdateAllObjectRecords
          canSoftDeleteAllObjectRecords
          canDestroyAllObjectRecords
          canUpdateAllSettings
          permissionFlags { id }
          fieldPermissions { id }
          rowLevelPermissionPredicates { id }
          rowLevelPermissionPredicateGroups { id }
          workspaceMembers { id }
          agents { id }
          apiKeys { id }
          objectPermissions {
            objectMetadataId
            canReadObjectRecords
            canUpdateObjectRecords
            canSoftDeleteObjectRecords
            canDestroyObjectRecords
          }
        }
        logicFunctions {
          universalIdentifier
          name
          databaseEventTriggerSettings
          httpRouteTriggerSettings
          cronTriggerSettings
          toolTriggerSettings
          workflowActionTriggerSettings
        }
      }
    }`,
  });
  if (data.currentWorkspace?.id !== workspaceId) {
    throw new Error('Workspace changed while verifying the installation');
  }
  const applications = (data.findManyApplications ?? []).filter(
    (application) => application.universalIdentifier === APPLICATION_ID,
  );
  if (applications.length !== 1) {
    throw new Error(
      `Expected one installed Corgi CRM app, found ${applications.length}`,
    );
  }
  const application = applications[0];
  if (application.state !== 'INSTALLED' || application.version !== version) {
    throw new Error('Corgi CRM app is not installed at the expected version');
  }
  const workspaceVariable = (application.applicationVariables ?? []).find(
    (variable) => variable.key === 'CORGI_CRM_WORKSPACE_ID',
  );
  if (workspaceVariable?.value !== workspaceId) {
    throw new Error(
      'Installed app workspace variable does not match the approved workspace',
    );
  }
  const triggers = (application.logicFunctions ?? []).filter(
    (logicFunction) => logicFunction.universalIdentifier === TRIGGER_ID,
  );
  const settings = parseTriggerSettings(
    triggers[0]?.databaseEventTriggerSettings,
  );
  if (
    triggers.length !== 1 ||
    settings?.eventName !== 'workspaceMember.created'
  ) {
    throw new Error('Corgi CRM member-created database trigger is not active');
  }
  return application;
};

const listAllMetadataObjects = async ({ graphql }) => {
  const objects = [];
  let cursor;
  const seenCursors = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await graphql({
      endpoint: '/metadata',
      operationName: 'VerifyCorgiCrmMetadataObjects',
      query: `query VerifyCorgiCrmMetadataObjects($after: ConnectionCursor) {
        objects(paging: { first: ${PAGE_SIZE}, after: $after }, filter: {}) {
          edges {
            node {
              id
              nameSingular
              universalIdentifier
              isActive
              applicationId
              fieldsList {
                id
                name
                type
                isActive
                isUIEditable
                writability
                options
                universalIdentifier
                relation { targetObjectMetadata { nameSingular } }
              }
              indexMetadataList {
                isUnique
                indexFieldMetadataList { fieldMetadataId order }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: { after: cursor ?? null },
    });
    const connection = data.objects;
    if (!connection || !Array.isArray(connection.edges)) {
      throw new Error('Metadata object verification returned an invalid connection');
    }
    objects.push(...connection.edges.map((edge) => edge?.node).filter(Boolean));
    if (!connection.pageInfo?.hasNextPage) return objects;
    cursor = connection.pageInfo.endCursor;
    if (!cursor || seenCursors.has(cursor)) {
      throw new Error('Metadata object verification returned an invalid cursor');
    }
    seenCursors.add(cursor);
  }
  throw new Error(`Metadata object verification exceeded ${MAX_PAGES} pages`);
};

const loadMeetingExperience = async ({ graphql, objectMetadataId }) => {
  const data = await graphql({
    endpoint: '/metadata',
    operationName: 'VerifyCorgiCrmMeetingExperience',
    query: `query VerifyCorgiCrmMeetingExperience($objectMetadataId: String!) {
      getViews(objectMetadataId: $objectMetadataId) {
        universalIdentifier
        objectMetadataId
        type
        calendarFieldMetadataId
        calendarLayout
        isActive
        viewFields { fieldMetadataId isActive }
      }
      getPageLayouts(
        objectMetadataId: $objectMetadataId
        pageLayoutType: RECORD_PAGE
      ) {
        universalIdentifier
        objectMetadataId
        type
        tabs { widgets { type isActive } }
      }
    }`,
    variables: { objectMetadataId },
  });
  return {
    views: data.getViews,
    pageLayouts: data.getPageLayouts,
  };
};

const listAllRecords = async ({ graphql, operationName, root, selection }) => {
  const records = [];
  let cursor;
  const seenCursors = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await graphql({
      endpoint: '/graphql',
      operationName,
      query: `query ${operationName}($after: String) {
        ${root}(first: ${PAGE_SIZE}, after: $after) {
          edges { node { ${selection} } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: { after: cursor ?? null },
    });
    const connection = data[root];
    if (!connection || !Array.isArray(connection.edges)) {
      throw new Error(`${operationName} returned an invalid connection`);
    }
    records.push(...connection.edges.map((edge) => edge?.node).filter(Boolean));
    if (!connection.pageInfo?.hasNextPage) return records;
    cursor = connection.pageInfo.endCursor;
    if (!cursor || seenCursors.has(cursor)) {
      throw new Error(`${operationName} returned an invalid pagination cursor`);
    }
    seenCursors.add(cursor);
  }
  throw new Error(`${operationName} exceeded ${MAX_PAGES} pages`);
};

const normalizeEmail = (value) => value.trim().toLowerCase();
const normalizeNamePart = (value) => value?.trim().replace(/\s+/g, ' ') ?? '';
const expectedName = (member) => {
  const fullName = [member.name?.firstName, member.name?.lastName]
    .map(normalizeNamePart)
    .filter(Boolean)
    .join(' ');
  return (
    fullName || normalizeEmail(member.userEmail).split('@')[0] || 'Wholesaler'
  );
};

const verifyReconciliation = ({ members, wholesalers }) => {
  const usableMembers = members.filter(
    (member) => member.id?.trim() && member.userEmail?.trim(),
  );
  const memberIds = new Set(
    members.filter((member) => member.id?.trim()).map((member) => member.id),
  );
  for (const member of usableMembers) {
    const email = normalizeEmail(member.userEmail);
    const matches = wholesalers.filter(
      (wholesaler) =>
        wholesaler.workspaceMemberId === member.id ||
        normalizeEmail(wholesaler.email ?? '') === email,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Workspace member ${member.id} has ${matches.length} identities`,
      );
    }
    const wholesaler = matches[0];
    if (
      wholesaler.workspaceMemberId !== member.id ||
      normalizeEmail(wholesaler.email ?? '') !== email ||
      normalizeNamePart(wholesaler.name) !== expectedName(member) ||
      !wholesaler.wholesalerRole?.trim()
    ) {
      throw new Error(`Workspace member ${member.id} has a stale identity`);
    }
  }
  const orphanCount = wholesalers.filter(
    (wholesaler) =>
      wholesaler.workspaceMemberId?.trim() &&
      !memberIds.has(wholesaler.workspaceMemberId),
  ).length;
  if (orphanCount > 0) {
    throw new Error(
      `${orphanCount} identities link to absent workspace members`,
    );
  }
  return { members: usableMembers.length, wholesalers: wholesalers.length };
};

// Read-only evidence before publishing an immutable version. Exercise the same
// filters as the generated app client and disclose counts, never owner data.
const inspectReconciliationPreflight = async ({ graphql }) => {
  const [members, wholesalers] = await Promise.all([
    listAllRecords({ graphql, operationName: 'PreflightOwnerMembers',
      root: 'workspaceMembers', selection: 'id userEmail name { firstName lastName }' }),
    listAllRecords({ graphql, operationName: 'PreflightOwnerWholesalers',
      root: 'wholesalers', selection: 'id name email wholesalerRole workspaceMemberId' }),
  ]);
  const result = {
    members: members.length, wholesalers: wholesalers.length,
    needsCreation: 0, existingIdentity: 0, missingMemberIdentity: 0,
    ambiguousIdentity: 0, conflictingMemberLink: 0, filteredReadMismatch: 0,
  };
  const ids = (records) => [...new Set(records.map(({ id }) => id))].sort().join(',');
  for (const member of members) {
    if (!UUID_PATTERN.test(member.id ?? '') || !member.userEmail?.trim()) {
      result.missingMemberIdentity += 1;
      continue;
    }
    const email = normalizeEmail(member.userEmail);
    const byMember = wholesalers.filter((row) => row.workspaceMemberId === member.id);
    const byEmail = wholesalers.filter((row) => normalizeEmail(row.email ?? '') === email);
    const matches = [...new Map([...byMember, ...byEmail].map((row) => [row.id, row])).values()];
    if (matches.length === 0) result.needsCreation += 1;
    else if (matches.length === 1) result.existingIdentity += 1;
    else result.ambiguousIdentity += 1;
    if (matches.some((row) => row.workspaceMemberId && row.workspaceMemberId !== member.id)) {
      result.conflictingMemberLink += 1;
    }
    const filteredReads = [
      {
        operationName: 'PreflightOwnerByMember',
        query: `query PreflightOwnerByMember($memberId: UUID!) {
        wholesalers(first: 3, filter: { workspaceMemberId: { eq: $memberId } }) {
          edges { node { id } }
        }
      }`,
        variables: { memberId: member.id },
        baseline: byMember,
      },
      {
        operationName: 'PreflightOwnerByEmail',
        query: `query PreflightOwnerByEmail($emailPattern: String!) {
        wholesalers(first: 3, filter: { email: { ilike: $emailPattern } }) {
          edges { node { id } }
        }
      }`,
        variables: {
          emailPattern: email.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_'),
        },
        baseline: byEmail,
      },
    ];
    const settledReads = await Promise.allSettled(
      filteredReads.map(({ operationName, query, variables }) =>
        graphql({
          endpoint: '/graphql',
          operationName,
          query,
          variables,
        }),
      ),
    );
    const failures = [];
    let filteredReadMismatch = false;
    for (const [index, settled] of settledReads.entries()) {
      if (settled.status === 'fulfilled') continue;
      const operationName = filteredReads[index].operationName;
      const safeDiagnostics =
        settled.reason instanceof VerificationGraphqlError &&
        settled.reason.operationName === operationName
          ? settled.reason.safeDiagnostics
          : 'UNKNOWN/unexpected=1';
      failures.push(`${operationName}=${safeDiagnostics}`);
    }
    if (failures.length > 0) {
      throw new Error(
        `Owner reconciliation filtered reads failed: ${failures.join(', ')}`,
      );
    }
    for (const [index, settled] of settledReads.entries()) {
      const operationName = filteredReads[index].operationName;
      const connection = settled.value.wholesalers;
      if (
        !Array.isArray(connection?.edges) ||
        connection.edges.some((edge) => !edge?.node?.id)
      ) {
        throw new Error(
          `Owner reconciliation ${operationName} returned an invalid filtered connection`,
        );
      }
      if (
        ids(connection.edges.map(({ node }) => node)) !==
        ids(filteredReads[index].baseline)
      ) {
        filteredReadMismatch = true;
      }
    }
    if (filteredReadMismatch) result.filteredReadMismatch += 1;
  }
  return result;
};

const main = async () => {
  const mode = process.argv[2];
  if (
    mode !== 'target' &&
    mode !== 'role-env' &&
    mode !== 'installed' &&
    mode !== 'telegram' &&
    mode !== 'telegram-disabled'
  ) {
    throw new Error(
      'Usage: verify-production-install.mjs <target|role-env|installed|telegram|telegram-disabled>',
    );
  }
  const origin = new URL(requiredEnvironment('CORGI_CRM_API_URL')).origin;
  const workspaceId = requiredEnvironment('CORGI_CRM_EXPECTED_WORKSPACE_ID');
  if (origin !== APPROVED_ORIGIN || !UUID_PATTERN.test(workspaceId)) {
    throw new Error('Production origin or derived workspace ID is invalid');
  }
  const graphql = createGraphqlClient({
    origin,
    apiKey: requiredEnvironment('CORGI_CRM_API_KEY'),
  });
  await verifyTargetWorkspace({ graphql, expectedWorkspaceId: workspaceId });
  await verifyRequiredSchema({ graphql });
  if (mode === 'target') {
    const preflight = await inspectReconciliationPreflight({ graphql });
    console.log(JSON.stringify({ ownerReconciliationPreflight: preflight }));
    if (preflight.missingMemberIdentity || preflight.ambiguousIdentity ||
        preflight.conflictingMemberLink || preflight.filteredReadMismatch) {
      throw new Error('Owner reconciliation preflight requires review before publication');
    }
    console.log('Verified Corgi CRM production target workspace.');
    return;
  }

  const metadataObjects = await listAllMetadataObjects({ graphql });
  if (mode === 'role-env') {
    const outputPath = requiredEnvironment('CORGI_CRM_ROLE_ENV_PATH');
    const identifiers = resolveCorgiRoleObjectIdentifiers(metadataObjects);
    await appendFile(
      outputPath,
      `${Object.entries(identifiers)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`,
      'utf8',
    );
    console.log('Resolved Corgi CRM role object identifiers for packaging.');
    return;
  }

  const application = await verifyInstalledApplication({
    graphql,
    version: requiredEnvironment('CORGI_CRM_EXPECTED_VERSION'),
    workspaceId,
  });
  verifyTelegramPersistenceSchema(metadataObjects);
  const meetingObject = exactlyOne(
    metadataObjects,
    (candidate) =>
      candidate?.nameSingular === 'meetingBooking' &&
      candidate.isActive === true,
    'meetingBooking metadata object',
  );
  const meetingExperience = await loadMeetingExperience({
    graphql,
    objectMetadataId: meetingObject.id,
  });
  verifyMeetingBookingSchema(metadataObjects, meetingExperience);
  verifyMeetingApplicationContract(application);
  verifyApplicationRoleContract(
    application.defaultLogicFunctionRole,
    metadataObjects,
  );
  const [members, wholesalers] = await Promise.all([
    listAllRecords({
      graphql,
      operationName: 'VerifyCorgiCrmWorkspaceMembers',
      root: 'workspaceMembers',
      selection: 'id userEmail name { firstName lastName }',
    }),
    listAllRecords({
      graphql,
      operationName: 'VerifyCorgiCrmWholesalers',
      root: 'wholesalers',
      selection: 'id name email wholesalerRole workspaceMemberId',
    }),
  ]);
  const result = verifyReconciliation({ members, wholesalers });
  if (mode === 'telegram') {
    verifyTelegramApplicationContract(application, workspaceId);
  } else if (mode === 'telegram-disabled') {
    verifyTelegramDisabled(application, workspaceId);
  }
  console.log(
    `Verified installed app, active trigger, and ${result.members} member identities across ${result.wholesalers} wholesalers${mode === 'telegram' ? ', including the configured Telegram topology' : ''}.`,
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

export {
  inspectReconciliationPreflight,
  parseResponse,
  resolveCorgiRoleObjectIdentifiers,
  verifyApplicationRoleContract,
  verifyMeetingApplicationContract,
  verifyMeetingBookingSchema,
  verifyReconciliation,
  verifyTelegramApplicationContract,
  verifyTelegramDisabled,
  verifyTelegramPersistenceSchema,
  VerificationGraphqlError,
};

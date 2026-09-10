import { pathToFileURL } from 'node:url';

const APPLICATION_UNIVERSAL_IDENTIFIER = 'ca87ad48-b62a-41be-a790-7c17707ff1b4';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const required = (value, label) => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const validateLinkBindings = (raw) => {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Telegram link configuration must be valid JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).join(',') !== 'bindings' ||
    !Array.isArray(parsed.bindings)
  ) {
    throw new Error('Telegram link configuration needs a bindings array');
  }
  const bindings = parsed.bindings.map((binding) => {
    if (
      !binding ||
      typeof binding !== 'object' ||
      Array.isArray(binding) ||
      Object.keys(binding).sort().join(',') !==
        'code,telegramUserId,workspaceMemberId'
    ) {
      throw new Error('Telegram link binding has an invalid shape');
    }
    const code = required(binding.code, 'Telegram link code');
    const workspaceMemberId = required(
      binding.workspaceMemberId,
      'Telegram link workspace member',
    );
    const telegramUserId = required(
      binding.telegramUserId,
      'Telegram link user',
    );
    if (!UUID_PATTERN.test(workspaceMemberId)) {
      throw new Error('Telegram link workspace member must be a UUID');
    }
    if (!/^[1-9][0-9]*$/.test(telegramUserId)) {
      throw new Error('Telegram link user must be a numeric ID');
    }
    return { code, workspaceMemberId, telegramUserId };
  });
  for (const property of ['code', 'workspaceMemberId', 'telegramUserId']) {
    const values = bindings.map((binding) => binding[property]);
    if (new Set(values).size !== values.length) {
      throw new Error(`Duplicate Telegram link ${property} binding`);
    }
  }
  return JSON.stringify({ bindings });
};

const validateNotificationRoutes = (raw) => {
  if (!raw?.trim()) return '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'Telegram notification route configuration must be valid JSON',
    );
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).length === 0
  ) {
    return '{}';
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(',') !== 'routes,version' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.routes) ||
    parsed.routes.length > 25
  ) {
    throw new Error('Telegram notification route configuration is invalid');
  }
  const routes = parsed.routes.map((route) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      throw new Error('Telegram notification route is invalid');
    }
    const keys = Object.keys(route).sort().join(',');
    if (keys !== 'chatId,event' && keys !== 'chatId,event,messageThreadId') {
      throw new Error('Telegram notification route is invalid');
    }
    const chatId = typeof route.chatId === 'string' ? route.chatId.trim() : '';
    if (route.event !== 'meeting_booked' || !/^-?[1-9][0-9]*$/.test(chatId)) {
      throw new Error('Telegram notification route is invalid');
    }
    const chatIdDigits = chatId.startsWith('-') ? chatId.slice(1) : chatId;
    const maxChatId = chatId.startsWith('-')
      ? '9223372036854775808'
      : '9223372036854775807';
    if (
      chatIdDigits.length > 19 ||
      (chatIdDigits.length === 19 && chatIdDigits > maxChatId)
    ) {
      throw new Error('Telegram notification route is invalid');
    }
    if (
      route.messageThreadId !== undefined &&
      (!Number.isSafeInteger(route.messageThreadId) ||
        route.messageThreadId <= 0)
    ) {
      throw new Error('Telegram notification route is invalid');
    }
    return {
      event: route.event,
      chatId,
      ...(route.messageThreadId === undefined
        ? {}
        : { messageThreadId: route.messageThreadId }),
    };
  });
  const destinations = routes.map(
    ({ event, chatId, messageThreadId }) =>
      `${event}:${chatId}:${messageThreadId ?? 'main'}`,
  );
  if (new Set(destinations).size !== destinations.length) {
    throw new Error('Duplicate Telegram notification route destination');
  }
  return JSON.stringify({ version: 1, routes });
};

// Mirrors parseTelegramGroupTopics: only an explicit supergroup chat and forum
// topic pair may run group commands, so a bad entry must fail the deploy rather
// than reach the runtime.
const validateGroupTopics = (raw) => {
  if (!raw?.trim()) return '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Telegram group topic configuration must be valid JSON');
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).length === 0
  ) {
    return '{}';
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(',') !== 'topics,version' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.topics) ||
    parsed.topics.length > 25
  ) {
    throw new Error('Telegram group topic configuration is invalid');
  }
  const topics = parsed.topics.map((topic) => {
    if (!topic || typeof topic !== 'object' || Array.isArray(topic)) {
      throw new Error('Telegram group topic is invalid');
    }
    if (Object.keys(topic).sort().join(',') !== 'chatId,messageThreadId') {
      throw new Error('Telegram group topic is invalid');
    }
    const chatId = typeof topic.chatId === 'string' ? topic.chatId.trim() : '';
    const numericChatId = Number(chatId);
    if (
      !/^-[1-9][0-9]*$/.test(chatId) ||
      !Number.isSafeInteger(numericChatId) ||
      numericChatId < -1997852516352 ||
      numericChatId > -1000000000001
    ) {
      throw new Error('Telegram group topic needs a supergroup chat ID');
    }
    if (
      !Number.isSafeInteger(topic.messageThreadId) ||
      topic.messageThreadId <= 0
    ) {
      throw new Error('Telegram group topic needs a forum topic ID');
    }
    return { chatId, messageThreadId: topic.messageThreadId };
  });
  const destinations = topics.map(
    ({ chatId, messageThreadId }) => `${chatId}:${messageThreadId}`,
  );
  if (new Set(destinations).size !== destinations.length) {
    throw new Error('Duplicate Telegram group topic');
  }
  return JSON.stringify({ version: 1, topics });
};

const validateTimeZone = (timeZone) => {
  const normalized = required(timeZone, 'Telegram time zone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format();
  } catch {
    throw new Error('Telegram time zone must be a valid IANA zone');
  }
  return normalized;
};

const validateTrustedTelegramConfiguration = ({
  workspaceId,
  token,
  webhookSecret,
  operatorSecret,
  linkCodesJson,
  notificationRoutesJson,
  groupTopicsJson,
  timeZone,
  dailySummaryTime,
  publicReportsEnabled = 'false',
}) => {
  if (publicReportsEnabled !== 'true' && publicReportsEnabled !== 'false') {
    throw new Error('Telegram public reports policy must be true or false');
  }
  const normalizedWorkspaceId = required(workspaceId, 'Workspace ID');
  if (!UUID_PATTERN.test(normalizedWorkspaceId)) {
    throw new Error('Workspace ID must be a UUID');
  }
  const normalizedTimeZone = validateTimeZone(timeZone);
  const normalizedTime = required(dailySummaryTime, 'Telegram summary time');
  const match = /^(?:[01][0-9]|2[0-3]):([0-5][0-9])$/.exec(normalizedTime);
  if (!match || Number(match[1]) % 15 !== 0) {
    throw new Error('Telegram summary time must be on a 15-minute boundary');
  }
  return {
    CORGI_CRM_WORKSPACE_ID: normalizedWorkspaceId,
    CORGI_CRM_TELEGRAM_BOT_TOKEN: required(token, 'Telegram token'),
    CORGI_CRM_TELEGRAM_WEBHOOK_SECRET: required(
      webhookSecret,
      'Telegram webhook secret',
    ),
    CORGI_CRM_TELEGRAM_OPERATOR_SECRET: required(
      operatorSecret,
      'Telegram operator secret',
    ),
    CORGI_CRM_TELEGRAM_LINK_CODES: validateLinkBindings(
      required(linkCodesJson, 'Telegram link configuration'),
    ),
    CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES: validateNotificationRoutes(
      notificationRoutesJson,
    ),
    CORGI_CRM_TELEGRAM_GROUP_TOPICS: validateGroupTopics(groupTopicsJson),
    CORGI_CRM_TELEGRAM_TIME_ZONE: normalizedTimeZone,
    CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME: normalizedTime,
    CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED: publicReportsEnabled,
  };
};

const validateWorkspaceId = (workspaceId) => {
  const normalized = required(workspaceId, 'Workspace ID');
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error('Workspace ID must be a UUID');
  }
  return normalized;
};

const exactlyOneApplication = (applications, { allowAbsent = false } = {}) => {
  if (!Array.isArray(applications)) {
    throw new Error('Installed Corgi CRM application lookup was invalid');
  }
  const matches = applications.filter(
    (application) =>
      application.universalIdentifier === APPLICATION_UNIVERSAL_IDENTIFIER,
  );
  if (allowAbsent && matches.length === 0) return null;
  if (matches.length !== 1 || !UUID_PATTERN.test(matches[0]?.id ?? '')) {
    throw new Error(
      `Expected one installed Corgi CRM application, found ${matches.length}`,
    );
  }
  return matches[0];
};

const configureTelegramApplication = async ({
  graphql,
  enabled,
  stage = false,
  ...input
}) => {
  // Enabling validates every trusted value before even looking up the app.
  // Disabling deliberately needs only the derived workspace identity so a
  // missing provider secret can never prevent the fail-closed application gate.
  const variables =
    enabled === true || stage === true
      ? validateTrustedTelegramConfiguration(input)
      : null;
  validateWorkspaceId(input.workspaceId);
  const data = await graphql({
    endpoint: '/metadata',
    operationName: 'FindCorgiCrmApplication',
    query: `query FindCorgiCrmApplication {
      findManyApplications { id universalIdentifier }
    }`,
  });
  const application = exactlyOneApplication(data?.findManyApplications, {
    allowAbsent: variables === null,
  });
  if (!application) return { status: 'already-disabled' };
  const write = async (key, value) => {
    const result = await graphql({
      endpoint: '/metadata',
      operationName: 'ConfigureCorgiCrmApplicationVariable',
      query: `mutation ConfigureCorgiCrmApplicationVariable(
        $applicationId: UUID!, $key: String!, $value: String!
      ) {
        updateOneApplicationVariable(
          applicationId: $applicationId, key: $key, value: $value
        )
      }`,
      variables: { applicationId: application.id, key, value },
    });
    if (result?.updateOneApplicationVariable !== true) {
      throw new Error(`Telegram application variable ${key} was not updated`);
    }
  };

  await write('CORGI_CRM_TELEGRAM_ENABLED', 'false');
  if (!variables) {
    await write(
      'CORGI_CRM_WORKSPACE_ID',
      validateWorkspaceId(input.workspaceId),
    );
    if (input.timeZone?.trim()) {
      await write(
        'CORGI_CRM_TELEGRAM_TIME_ZONE',
        validateTimeZone(input.timeZone),
      );
    }
    return { status: 'disabled' };
  }
  for (const [key, value] of Object.entries(variables)) await write(key, value);
  if (enabled === true) await write('CORGI_CRM_TELEGRAM_ENABLED', 'true');
  return {
    status:
      enabled === true ? 'enabled' : stage === true ? 'staged' : 'disabled',
  };
};

const parseResponse = async (response, operationName) => {
  if (!response.ok)
    throw new Error(`${operationName} failed with HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors?.length || !body.data) {
    throw new Error(`${operationName} returned GraphQL errors`);
  }
  return body.data;
};

const createGraphqlClient =
  ({ origin, apiKey }) =>
  async (request) =>
    parseResponse(
      await fetch(new URL(request.endpoint, origin), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Origin: origin,
        },
        body: JSON.stringify({
          operationName: request.operationName,
          query: request.query,
          variables: request.variables ?? {},
        }),
        redirect: 'error',
      }),
      request.operationName,
    );

const main = async () => {
  const mode = process.argv[2];
  if (mode !== 'disabled' && mode !== 'stage' && mode !== 'enable') {
    throw new Error('Usage: configure-telegram.mjs <disabled|stage|enable>');
  }
  const origin = new URL(required(process.env.CORGI_CRM_API_URL, 'CRM API URL'))
    .origin;
  const result = await configureTelegramApplication({
    graphql: createGraphqlClient({
      origin,
      apiKey: required(process.env.CORGI_CRM_API_KEY, 'CRM API key'),
    }),
    workspaceId: process.env.CORGI_CRM_EXPECTED_WORKSPACE_ID,
    token: process.env.CORGI_CRM_TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.CORGI_CRM_TELEGRAM_WEBHOOK_SECRET,
    operatorSecret: process.env.CORGI_CRM_TELEGRAM_OPERATOR_SECRET,
    linkCodesJson: process.env.CORGI_CRM_TELEGRAM_LINK_CODES,
    notificationRoutesJson: process.env.CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES,
    groupTopicsJson: process.env.CORGI_CRM_TELEGRAM_GROUP_TOPICS,
    timeZone: process.env.CORGI_CRM_TELEGRAM_TIME_ZONE,
    dailySummaryTime: process.env.CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME,
    publicReportsEnabled:
      process.env.CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED || 'false',
    enabled: mode === 'enable',
    stage: mode === 'stage',
  });
  console.log(`Telegram application configuration is ${result.status}.`);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

export { configureTelegramApplication, validateTrustedTelegramConfiguration };

import { pathToFileURL } from 'node:url';

const APPLICATION_UNIVERSAL_IDENTIFIER =
  'ca87ad48-b62a-41be-a790-7c17707ff1b4';
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
    !Array.isArray(parsed.bindings) ||
    parsed.bindings.length === 0
  ) {
    throw new Error('Telegram link configuration needs a non-empty bindings array');
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

const validateTrustedTelegramConfiguration = ({
  workspaceId,
  token,
  webhookSecret,
  operatorSecret,
  linkCodesJson,
  timeZone,
  dailySummaryTime,
}) => {
  const normalizedWorkspaceId = required(workspaceId, 'Workspace ID');
  if (!UUID_PATTERN.test(normalizedWorkspaceId)) {
    throw new Error('Workspace ID must be a UUID');
  }
  const normalizedTimeZone = required(timeZone, 'Telegram time zone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalizedTimeZone }).format();
  } catch {
    throw new Error('Telegram time zone must be a valid IANA zone');
  }
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
    CORGI_CRM_TELEGRAM_TIME_ZONE: normalizedTimeZone,
    CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME: normalizedTime,
  };
};

const exactlyOneApplication = (applications) => {
  const matches = (applications ?? []).filter(
    (application) =>
      application.universalIdentifier === APPLICATION_UNIVERSAL_IDENTIFIER,
  );
  if (matches.length !== 1 || !UUID_PATTERN.test(matches[0]?.id ?? '')) {
    throw new Error(`Expected one installed Corgi CRM application, found ${matches.length}`);
  }
  return matches[0];
};

const configureTelegramApplication = async ({ graphql, enabled, ...input }) => {
  // Validate every trusted value before even looking up the app, and especially
  // before the first mutation. Secrets are never read back from masked metadata.
  const variables = validateTrustedTelegramConfiguration(input);
  const data = await graphql({
    endpoint: '/metadata',
    operationName: 'FindCorgiCrmApplication',
    query: `query FindCorgiCrmApplication {
      findManyApplications { id universalIdentifier }
    }`,
  });
  const application = exactlyOneApplication(data.findManyApplications);
  const write = async (key, value) => {
    const result = await graphql({
      endpoint: '/metadata',
      operationName: 'ConfigureCorgiCrmApplicationVariable',
      query: `mutation ConfigureCorgiCrmApplicationVariable(
        $applicationId: UUID!, $key: String!, $value: String!
      ) {
        updateOneApplicationVariable(
          applicationId: $applicationId, key: $key, value: $value
        ) { key }
      }`,
      variables: { applicationId: application.id, key, value },
    });
    if (result.updateOneApplicationVariable?.key !== key) {
      throw new Error(`Telegram application variable ${key} was not updated`);
    }
  };

  await write('CORGI_CRM_TELEGRAM_ENABLED', 'false');
  for (const [key, value] of Object.entries(variables)) await write(key, value);
  if (enabled === true) await write('CORGI_CRM_TELEGRAM_ENABLED', 'true');
  return { status: enabled === true ? 'enabled' : 'disabled' };
};

const parseResponse = async (response, operationName) => {
  if (!response.ok) throw new Error(`${operationName} failed with HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors?.length || !body.data) {
    throw new Error(`${operationName} returned GraphQL errors`);
  }
  return body.data;
};

const createGraphqlClient = ({ origin, apiKey }) => async (request) =>
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
  if (mode !== 'disabled' && mode !== 'enable') {
    throw new Error('Usage: configure-telegram.mjs <disabled|enable>');
  }
  const origin = new URL(required(process.env.CORGI_CRM_API_URL, 'CRM API URL')).origin;
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
    timeZone: process.env.CORGI_CRM_TELEGRAM_TIME_ZONE,
    dailySummaryTime: process.env.CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME,
    enabled: mode === 'enable',
  });
  console.log(`Telegram application configuration is ${result.status}.`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export {
  configureTelegramApplication,
  validateTrustedTelegramConfiguration,
};

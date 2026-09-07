const requiredEnvironmentVariableNames = [
  'FRONTEND_BASE_URL',
  'BACKEND_BASE_URL',
  'CRM_E2E_LOGIN',
  'CRM_E2E_PASSWORD',
] as const;

type RequiredEnvironmentVariableName =
  (typeof requiredEnvironmentVariableNames)[number];

export const requireProductionEnvironment = (): Record<
  RequiredEnvironmentVariableName,
  string
> => {
  const missingVariableNames = requiredEnvironmentVariableNames.filter(
    (variableName) => !process.env[variableName],
  );

  if (missingVariableNames.length > 0) {
    throw new Error(
      `Missing required production E2E environment variables: ${missingVariableNames.join(', ')}`,
    );
  }

  return Object.fromEntries(
    requiredEnvironmentVariableNames.map((variableName) => [
      variableName,
      process.env[variableName] as string,
    ]),
  ) as Record<RequiredEnvironmentVariableName, string>;
};

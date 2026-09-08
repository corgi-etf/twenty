import { type ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { isEnvOnlyConfigVar } from 'src/engine/core-modules/twenty-config/utils/is-env-only-config-var.util';

describe('isEnvOnlyConfigVar', () => {
  it.each<keyof ConfigVariables>([
    'EMAIL_DRIVER',
    'EMAIL_FROM_ADDRESS',
    'EMAIL_FROM_NAME',
    'AWS_SES_REGION',
  ])(
    'keeps deployment-owned email setting %s out of database config',
    (key) => {
      expect(isEnvOnlyConfigVar(key)).toBe(true);
    },
  );

  it('keeps unrelated SMTP settings database-configurable', () => {
    expect(isEnvOnlyConfigVar('EMAIL_SMTP_HOST')).toBe(false);
  });
});

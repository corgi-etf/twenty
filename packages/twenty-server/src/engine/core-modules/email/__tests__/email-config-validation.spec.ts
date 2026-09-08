import { validate } from 'src/engine/core-modules/twenty-config/config-variables';

describe('AWS SES email configuration', () => {
  it('requires an AWS region when the platform email driver uses SES', () => {
    expect(() => validate({ EMAIL_DRIVER: 'AWS_SES' })).toThrow(
      'Config variables validation failed',
    );
  });

  it('accepts a valid AWS region for the platform email driver', () => {
    expect(
      validate({ EMAIL_DRIVER: 'AWS_SES', AWS_SES_REGION: 'us-east-2' }),
    ).toMatchObject({
      EMAIL_DRIVER: 'AWS_SES',
      AWS_SES_REGION: 'us-east-2',
    });
  });

  it('rejects an invalid AWS region for the platform email driver', () => {
    expect(() =>
      validate({ EMAIL_DRIVER: 'AWS_SES', AWS_SES_REGION: 'invalid' }),
    ).toThrow('Config variables validation failed');
  });
});

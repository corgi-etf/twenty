import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

import { AwsSesDriver } from 'src/engine/core-modules/email/drivers/aws-ses.driver';

const mockSesSend = jest.fn();

jest.mock('@aws-sdk/client-sesv2', () => {
  const actual = jest.requireActual('@aws-sdk/client-sesv2');

  return {
    ...actual,
    SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  };
});

describe('AwsSesDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends text and HTML content through SES using task-role credentials', async () => {
    mockSesSend.mockResolvedValue({ MessageId: 'message-id' });

    const driver = new AwsSesDriver({ region: 'us-east-2' });

    expect(SESv2Client).toHaveBeenCalledTimes(1);

    await driver.send({
      from: 'Corgi CRM <noreply@corgiinvest.com>',
      to: 'recipient@example.com',
      subject: 'Join your team on Twenty',
      text: 'Invitation text',
      html: '<p>Invitation HTML</p>',
    });

    expect(SESv2Client).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'us-east-2' }),
    );
    expect(SESv2Client).toHaveBeenCalledWith(
      expect.not.objectContaining({ credentials: expect.anything() }),
    );
    expect(mockSesSend).toHaveBeenCalledTimes(1);

    const command = mockSesSend.mock.calls[0][0];

    expect(command).toBeInstanceOf(SendEmailCommand);

    expect(command.input).toEqual({
      Content: {
        Simple: {
          Body: {
            Html: { Charset: 'UTF-8', Data: '<p>Invitation HTML</p>' },
            Text: { Charset: 'UTF-8', Data: 'Invitation text' },
          },
          Subject: {
            Charset: 'UTF-8',
            Data: 'Join your team on Twenty',
          },
        },
      },
      Destination: {
        BccAddresses: undefined,
        CcAddresses: undefined,
        ToAddresses: ['recipient@example.com'],
      },
      FromEmailAddress: 'Corgi CRM <noreply@corgiinvest.com>',
      ReplyToAddresses: undefined,
    });
  });

  it('propagates SES failures so the queue can retry delivery', async () => {
    mockSesSend.mockRejectedValue(new Error('SES is unavailable'));

    const driver = new AwsSesDriver({ region: 'us-east-2' });

    await expect(
      driver.send({
        from: 'noreply@corgiinvest.com',
        to: 'recipient@example.com',
        subject: 'Invitation',
        text: 'Invitation text',
      }),
    ).rejects.toThrow('SES is unavailable');
  });
});

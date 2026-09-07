import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { type SendMailOptions } from 'nodemailer';
import addressParser from 'nodemailer/lib/addressparser';

import { type EmailDriverInterface } from 'src/engine/core-modules/email/drivers/interfaces/email-driver.interface';
import { type AwsRegion } from 'src/engine/core-modules/twenty-config/interfaces/aws-region.interface';
import { buildAwsRequestHandlerOptions } from 'src/utils/aws-request-handler.util';

type AwsSesDriverOptions = {
  region: AwsRegion;
};

type AddressList = SendMailOptions['to'];

const formatAddress = ({
  address,
  name,
}: {
  address: string;
  name: string;
}): string => {
  if (name.length === 0) {
    return address;
  }

  const displayName = /[",<>]/u.test(name) ? JSON.stringify(name) : name;

  return `${displayName} <${address}>`;
};

const parseAddresses = (addresses: AddressList): string[] | undefined => {
  if (addresses === undefined) {
    return undefined;
  }

  const addressValues = Array.isArray(addresses) ? addresses : [addresses];

  return addressValues.flatMap((addressValue) => {
    if (typeof addressValue === 'string') {
      return addressParser(addressValue, { flatten: true }).map(
        ({ address }) => address,
      );
    }

    return [addressValue.address];
  });
};

const parseFromAddress = (from: SendMailOptions['from']): string => {
  if (from === undefined) {
    throw new Error('AWS SES email delivery requires a From address');
  }

  const fromValues = Array.isArray(from) ? from : [from];
  const parsedAddresses = fromValues.flatMap((fromValue) =>
    typeof fromValue === 'string'
      ? addressParser(fromValue, { flatten: true })
      : [fromValue],
  );

  if (parsedAddresses.length !== 1) {
    throw new Error('AWS SES email delivery requires exactly one From address');
  }

  return formatAddress(parsedAddresses[0]);
};

const parseContent = (
  content: SendMailOptions['text'] | SendMailOptions['html'],
  label: string,
): string | undefined => {
  if (content === undefined) {
    return undefined;
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Buffer.isBuffer(content)) {
    return content.toString('utf8');
  }

  throw new Error(`AWS SES email delivery requires ${label} to be text`);
};

export class AwsSesDriver implements EmailDriverInterface {
  private readonly sesClient: SESv2Client;

  constructor(options: AwsSesDriverOptions) {
    this.sesClient = new SESv2Client({
      region: options.region,
      requestHandler: buildAwsRequestHandlerOptions(),
    });
  }

  async send(sendMailOptions: SendMailOptions): Promise<void> {
    if (sendMailOptions.attachments?.length) {
      throw new Error('AWS SES platform emails do not support attachments');
    }

    const text = parseContent(sendMailOptions.text, 'text content');
    const html = parseContent(sendMailOptions.html, 'HTML content');

    await this.sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: parseFromAddress(sendMailOptions.from),
        Destination: {
          ToAddresses: parseAddresses(sendMailOptions.to),
          CcAddresses: parseAddresses(sendMailOptions.cc),
          BccAddresses: parseAddresses(sendMailOptions.bcc),
        },
        ReplyToAddresses: parseAddresses(sendMailOptions.replyTo),
        Content: {
          Simple: {
            Subject: {
              Data: sendMailOptions.subject ?? '',
              Charset: 'UTF-8',
            },
            Body: {
              ...(text === undefined
                ? {}
                : { Text: { Data: text, Charset: 'UTF-8' } }),
              ...(html === undefined
                ? {}
                : { Html: { Data: html, Charset: 'UTF-8' } }),
            },
          },
        },
      }),
    );
  }
}

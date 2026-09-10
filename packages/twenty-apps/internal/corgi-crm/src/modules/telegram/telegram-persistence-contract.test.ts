import { describe, expect, it } from 'vitest';

import telegramDeliveryUniqueIndex from 'src/indexes/telegram-delivery-key.index';
import telegramDeliveryAuditUniqueIndex from 'src/indexes/telegram-delivery-audit-request.index';
import telegramDelivery from 'src/objects/telegram-delivery.object';
import telegramDeliveryAudit from 'src/objects/telegram-delivery-audit.object';

describe('Telegram durable delivery schema', () => {
  it('owns an operator-visible delivery record with one atomic key', () => {
    expect(telegramDelivery.success).toBe(true);
    expect(telegramDelivery.config).toMatchObject({
      nameSingular: 'telegramDelivery',
      namePlural: 'telegramDeliveries',
      isSearchable: true,
    });
    expect(telegramDeliveryUniqueIndex.success).toBe(true);
    expect(telegramDeliveryUniqueIndex.config.isUnique).toBe(true);
    expect(telegramDeliveryUniqueIndex.config.fields).toHaveLength(1);
    expect(
      telegramDelivery.config.fields?.map((field) => field.name),
    ).toEqual(
      expect.arrayContaining([
        'name',
        'deliveryKey',
        'operationDigest',
        'status',
        'stateToken',
        'attempts',
        'resetCount',
        'unknownAt',
        'lastReasonCode',
        'retryRequestId',
        'approvedUnknownAt',
      ]),
    );
  });

  it('owns append-only reset audit records with unique request and generation keys', () => {
    expect(telegramDeliveryAudit.success).toBe(true);
    expect(telegramDeliveryAudit.config).toMatchObject({
      nameSingular: 'telegramDeliveryAudit',
      namePlural: 'telegramDeliveryAudits',
      isSearchable: true,
    });
    expect(telegramDeliveryAuditUniqueIndex.success).toBe(true);
    expect(telegramDeliveryAuditUniqueIndex.config.isUnique).toBe(true);
    expect(telegramDeliveryAuditUniqueIndex.config.fields).toHaveLength(2);
    expect(
      telegramDeliveryAudit.config.fields?.map((field) => field.name),
    ).toEqual(
      expect.arrayContaining([
        'name',
        'requestId',
        'deliveryKey',
        'expectedUnknownAt',
        'actorWorkspaceMemberId',
        'reasonDigest',
        'requestedAt',
      ]),
    );
  });
});

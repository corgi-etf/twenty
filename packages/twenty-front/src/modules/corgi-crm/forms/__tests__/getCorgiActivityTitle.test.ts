import { getCorgiActivityTitle } from '../utils/getCorgiActivityTitle';
it('uses the reporting date at midnight and DST boundaries', () => {
  expect(
    getCorgiActivityTitle({
      activityTypeLabel: 'Phone call',
      companyName: 'Example Advisory',
      occurredAt: '2026-10-05T04:59:59.000Z',
    }),
  ).toBe('Phone call - Example Advisory - 2026-10-04');
  expect(
    getCorgiActivityTitle({
      activityTypeLabel: 'Email',
      companyName: 'Example Advisory',
      occurredAt: '2026-10-05T05:00:00.000Z',
    }),
  ).toBe('Email - Example Advisory - 2026-10-05');
  expect(
    getCorgiActivityTitle({ occurredAt: '2026-11-01T07:30:00.000Z' }),
  ).toBe('Activity - Company not linked - 2026-11-01');
});

it('defers naming when a linked company has not loaded', () => {
  expect(
    getCorgiActivityTitle({
      activityType: 'EMAIL',
      companyId: 'company',
      occurredAt: '2026-10-05T12:00:00Z',
    }),
  ).toBeUndefined();
});

it('uses the canonical stored activity type regardless of translated labels', () => {
  expect(
    getCorgiActivityTitle({
      activityType: 'PHONE_CALL',
      activityTypeLabel: 'Appel',
      companyName: 'Acme',
      occurredAt: '2026-10-05T12:00:00Z',
    }),
  ).toBe('Phone call - Acme - 2026-10-05');
});

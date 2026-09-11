import { describe, expect, it } from 'vitest';

import { parseTelegramLogCommand } from 'src/modules/telegram/services/parse-telegram-log-command.service';

describe('parseTelegramLogCommand', () => {
  it('maps the call alias onto the canonical quick-log taxonomy', () => {
    expect(
      parseTelegramLogCommand(
        '/log call | Acme Holdings | connected | renewal chat',
        'activity-from-update-42',
      ),
    ).toEqual({
      activityId: 'activity-from-update-42',
      activityType: 'PHONE_CALL',
      companyQuery: 'Acme Holdings',
      outcome: 'connected',
      notes: 'renewal chat',
    });
  });

  it('parses explicit canonical fields and follow-up date', () => {
    expect(
      parseTelegramLogCommand(
        '/log type=meeting; company=Acme; contact=Jane Doe; outcome=follow_up_scheduled; notes=Send deck; followup=2026-09-12',
        'activity-from-update-43',
      ),
    ).toEqual({
      activityId: 'activity-from-update-43',
      activityType: 'MEETING',
      companyQuery: 'Acme',
      contactQuery: 'Jane Doe',
      outcome: 'follow_up_scheduled',
      notes: 'Send deck',
      followUpDate: '2026-09-12',
    });
  });

  it('rejects unsupported types and outcomes instead of inventing CRM values', () => {
    expect(() =>
      parseTelegramLogCommand(
        '/log sms | Acme | maybe',
        'activity-from-update-44',
      ),
    ).toThrow(/unsupported activity type/i);
    expect(() =>
      parseTelegramLogCommand(
        '/log call | Acme | interested',
        'activity-from-update-44',
      ),
    ).toThrow(/unsupported outcome/i);
  });
});

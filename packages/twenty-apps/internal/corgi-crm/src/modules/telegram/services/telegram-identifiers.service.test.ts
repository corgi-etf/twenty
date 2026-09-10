import { describe, expect, it } from 'vitest';

import { getTelegramActivityId } from 'src/modules/telegram/services/telegram-identifiers.service';

describe('getTelegramActivityId', () => {
  it('derives one stable UUID from the Telegram update id', () => {
    expect(getTelegramActivityId(42)).toBe(getTelegramActivityId(42));
    expect(getTelegramActivityId(42)).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(getTelegramActivityId(42)).not.toBe(getTelegramActivityId(43));
  });
});

import { describe, expect, it } from 'vitest';

import { splitTelegramMessage } from 'src/modules/telegram/services/split-telegram-message.service';

describe('splitTelegramMessage', () => {
  it('splits long summaries at line boundaries without losing content', () => {
    const text = ['header', 'one two three', 'four five six'].join('\n');
    const parts = splitTelegramMessage(text, 18);
    expect(parts.every((part) => part.length <= 18)).toBe(true);
    expect(parts.join('\n')).toBe(text);
  });

  it('hard-splits a single over-limit line', () => {
    expect(splitTelegramMessage('abcdefghij', 4)).toEqual([
      'abcd',
      'efgh',
      'ij',
    ]);
  });
});

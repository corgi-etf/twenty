import { describe, expect, it } from 'vitest';

import { isSnakeCaseString } from '../../../../../twenty-server/src/utils/is-snake-case-string';
import deliveryObject from './telegram-delivery.object';

describe('Telegram delivery metadata server compatibility', () => {
  it('uses server-valid enum values and a matching default', () => {
    expect(deliveryObject.config.fields.length).toBeGreaterThan(0);
    for (const field of deliveryObject.config.fields) {
      if (field.type !== 'SELECT') continue;
      for (const option of field.options ?? []) {
        expect(isSnakeCaseString(option.value), `${field.name}: ${option.value}`)
          .toBe(true);
      }
      if (typeof field.defaultValue === 'string') {
        expect(field.options?.map((option) => `'${option.value}'`))
          .toContain(field.defaultValue);
      }
    }
  });
});

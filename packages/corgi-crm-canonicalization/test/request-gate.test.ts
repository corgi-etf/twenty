import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createCanonicalizationRequestGate,
  type RateLimitedResponse,
} from '../src/request-gate.ts';

const response = (
  status: number,
  headers: Record<string, string> = {},
): RateLimitedResponse & { disposed: boolean } => ({
  disposed: false,
  status: () => status,
  headers: () => headers,
  async dispose() {
    this.disposed = true;
  },
});

test('the shared request gate serializes callers and spaces every request', async () => {
  let clock = 0;
  const waits: number[] = [];
  const requests: number[] = [];
  const gate = createCanonicalizationRequestGate({
    now: () => clock,
    wait: async (delay) => {
      waits.push(delay);
      clock += delay;
    },
  });

  await Promise.all([
    gate(async () => {
      requests.push(clock);
      return response(200);
    }),
    gate(async () => {
      requests.push(clock);
      return response(200);
    }),
  ]);

  assert.deepEqual(requests, [0, 650]);
  assert.deepEqual(waits, [650]);
});

test('the request gate honors Retry-After and X-RateLimit-Reset', async () => {
  let clock = 1_000;
  const waits: number[] = [];
  const gate = createCanonicalizationRequestGate({
    now: () => clock,
    wait: async (delay) => {
      waits.push(delay);
      clock += delay;
    },
  });
  const retryAfter = response(429, { 'retry-after': '2' });
  const reset = response(429, { 'x-ratelimit-reset': '5' });
  const queued = [retryAfter, reset, response(200)];

  const result = await gate(async () => queued.shift()!);

  assert.equal(result.status(), 200);
  assert.deepEqual(waits, [2_000, 2_000]);
  assert.equal(retryAfter.disposed, true);
  assert.equal(reset.disposed, true);
});

test('the request gate bounds repeated 429 responses', async () => {
  let clock = 0;
  let requests = 0;
  const gate = createCanonicalizationRequestGate({
    maxAttempts: 2,
    now: () => clock,
    wait: async (delay) => {
      clock += delay;
    },
  });

  await assert.rejects(
    gate(async () => {
      requests += 1;
      return response(429, { 'retry-after': '0' });
    }),
    /remained rate limited/,
  );
  assert.equal(requests, 2);
});

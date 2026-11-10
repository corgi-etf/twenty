import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  INGESTION_OIDC_AUDIENCE,
  requestGitHubOidcToken,
} from '../src/github-oidc.ts';

test('requests and masks a GitHub OIDC token for the exact ingestion audience', async () => {
  const masked: string[] = [];
  let request: { url: string; init?: RequestInit } | undefined;
  const token = await requestGitHubOidcToken({
    requestUrl:
      'https://pipelines.actions.githubusercontent.com/token?api-version=2.0',
    requestToken: 'github-request-token',
    maskSecret: (value) => masked.push(value),
    fetcher: async (input, init) => {
      request = { url: String(input), init };
      return new Response(
        JSON.stringify({ value: 'header.payload.signature' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  assert.equal(token, 'header.payload.signature');
  assert.deepEqual(masked, ['github-request-token', token]);
  assert.equal(
    new URL(request!.url).searchParams.get('audience'),
    INGESTION_OIDC_AUDIENCE,
  );
  assert.equal(
    new Headers(request!.init?.headers).get('authorization'),
    'Bearer github-request-token',
  );
});

test('rejects non-GitHub OIDC endpoints before requesting a token', async () => {
  let called = false;
  await assert.rejects(
    requestGitHubOidcToken({
      requestUrl: 'https://lookalike.example/token',
      requestToken: 'github-request-token',
      maskSecret: () => undefined,
      fetcher: async () => {
        called = true;
        return new Response();
      },
    }),
    /OIDC environment is invalid/,
  );
  assert.equal(called, false);
});

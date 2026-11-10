import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWorkflowIdentity } from '../src/cli.ts';

const approved = {
  GITHUB_REPOSITORY: 'Corgi-ETF/twenty',
  GITHUB_REPOSITORY_ID: '1359532075',
  GITHUB_REPOSITORY_OWNER_ID: '241377158',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  RUNNER_ENVIRONMENT: 'github-hosted',
};

test('accepts only the pinned manual production workflow identity', () => {
  assert.doesNotThrow(() => assertWorkflowIdentity(approved));
  assert.doesNotThrow(() =>
    assertWorkflowIdentity({
      ...approved,
      GITHUB_REPOSITORY: 'corgi-etf/twenty',
    }),
  );

  for (const key of Object.keys(approved)) {
    assert.throws(
      () => assertWorkflowIdentity({ ...approved, [key]: 'unexpected' }),
      /restricted to the approved manual production workflow/,
      key,
    );
  }
});

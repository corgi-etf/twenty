import { expect, test } from '@playwright/test';

import { CANONICALIZATION_APPROVED_WORKSPACE_ID } from '../../../corgi-crm-canonicalization/src/tenant-preflight.ts';
import { CANONICALIZATION_APPROVED_ORIGIN } from '../../../corgi-crm-canonicalization/src/twenty-rest-api.ts';
import { assertFetchMetadataCleanupWorkspace } from './fetchMetadataCleanupWorkspacePreflight';

const approvedHostname = new URL(CANONICALIZATION_APPROVED_ORIGIN).hostname;

test('accepts the approved workspace and hostname when the custom-domain flag is false', () => {
  expect(() =>
    assertFetchMetadataCleanupWorkspace({
      body: {
        data: {
          currentWorkspace: {
            id: CANONICALIZATION_APPROVED_WORKSPACE_ID,
            customDomain: approvedHostname,
            isCustomDomainEnabled: false,
          },
        },
      },
      expectedWorkspaceId: CANONICALIZATION_APPROVED_WORKSPACE_ID,
      expectedHostname: approvedHostname,
    }),
  ).not.toThrow();
});

test('rejects the wrong workspace or custom-domain hostname', () => {
  for (const currentWorkspace of [
    {
      id: '11111111-1111-4111-8111-111111111111',
      customDomain: approvedHostname,
      isCustomDomainEnabled: false,
    },
    {
      id: CANONICALIZATION_APPROVED_WORKSPACE_ID,
      customDomain: 'lookalike.example',
      isCustomDomainEnabled: false,
    },
  ]) {
    expect(() =>
      assertFetchMetadataCleanupWorkspace({
        body: { data: { currentWorkspace } },
        expectedWorkspaceId: CANONICALIZATION_APPROVED_WORKSPACE_ID,
        expectedHostname: approvedHostname,
      }),
    ).toThrow(/not approved/);
  }
});

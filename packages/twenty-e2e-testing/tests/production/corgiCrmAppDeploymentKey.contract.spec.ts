import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const deploymentKeySource = readFileSync(
  join(__dirname, 'corgiCrmAppDeploymentKey.production.spec.ts'),
  'utf8',
);
const deploymentWorkflowSource = readFileSync(
  join(__dirname, '../../../../.github/workflows/corgi-crm-app-production.yml'),
  'utf8',
);

test('keeps deployment-key management out of ordinary production smoke runs', () => {
  expect(deploymentKeySource).toMatch(
    /test\.skip\(\s*!process\.env\.CORGI_CRM_DEPLOYMENT_KEY_OPERATION\?\.trim\(\),/,
  );
});

test('keeps both guarded deployment-key operations wired into the app workflow', () => {
  expect(deploymentWorkflowSource).toContain(
    'CORGI_CRM_DEPLOYMENT_KEY_OPERATION: acquire',
  );
  expect(deploymentWorkflowSource).toContain(
    'CORGI_CRM_DEPLOYMENT_KEY_OPERATION: revoke',
  );
  expect(
    deploymentWorkflowSource.match(
      /tests\/production\/corgiCrmAppDeploymentKey\.production\.spec\.ts/g,
    ),
  ).toHaveLength(2);
});

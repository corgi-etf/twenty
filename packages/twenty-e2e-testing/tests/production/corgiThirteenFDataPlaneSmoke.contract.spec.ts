import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const repositoryRoot = join(__dirname, '..', '..', '..', '..');
const workflow = readFileSync(
  join(repositoryRoot, '.github/workflows/corgi-thirteen-f-app-production.yml'),
  'utf8',
);
const smoke = readFileSync(
  join(__dirname, 'corgiThirteenFDataPlaneSmoke.production.spec.ts'),
  'utf8',
);
const frontComponentSmoke = readFileSync(
  join(__dirname, 'corgiThirteenFFrontComponentSmoke.production.spec.ts'),
  'utf8',
);

const position = (needle: string): number => {
  const index = workflow.indexOf(needle);
  expect(index, `workflow must contain ${needle}`).not.toBe(-1);
  return index;
};

test('runs the authenticated 13F data-plane smoke after native metadata verification', () => {
  const verify = position('Verify the installed Corgi 13F native workspace');
  const smokeStep = position('Verify the live Corgi 13F data plane');
  const frontComponentStep = position('Verify the rendered Corgi 13F page');
  const rollback = position(
    "Roll back only this run's fresh installation and retain registration",
  );

  expect(verify).toBeLessThan(smokeStep);
  expect(smokeStep).toBeLessThan(frontComponentStep);
  expect(frontComponentStep).toBeLessThan(rollback);
  const step = workflow.slice(smokeStep, frontComponentStep);
  expect(step).toContain('corgiThirteenFDataPlaneSmoke.production.spec.ts');
  expect(step).toContain('id: data-plane');
  expect(step).toContain("CORGI_THIRTEEN_F_DATA_PLANE_SMOKE: 'true'");
  expect(step).toContain('CRM_E2E_LOGIN');
  expect(step).toContain('CRM_E2E_PASSWORD');
  expect(step).not.toContain('CORGI_CRM_API_KEY');
  expect(step).not.toContain('CORGI_THIRTEEN_F_API_READ_TOKEN');
  expect(step).not.toContain('continue-on-error');
  expect(workflow.slice(rollback)).toContain(
    "steps.data-plane.outcome == 'failure'",
  );
  expect(workflow.slice(rollback)).toContain(
    "steps.front-component.outcome == 'failure'",
  );
});

test('renders the authenticated native page after the data-plane smoke', () => {
  const dataPlaneStep = position('Verify the live Corgi 13F data plane');
  const frontComponentStep = position('Verify the rendered Corgi 13F page');
  const rollback = position(
    "Roll back only this run's fresh installation and retain registration",
  );
  const step = workflow.slice(frontComponentStep, rollback);

  expect(dataPlaneStep).toBeLessThan(frontComponentStep);
  expect(frontComponentStep).toBeLessThan(rollback);
  expect(step).toContain(
    'corgiThirteenFFrontComponentSmoke.production.spec.ts',
  );
  expect(step).toContain('id: front-component');
  expect(step).toContain(
    "CORGI_THIRTEEN_F_FRONT_COMPONENT_SMOKE: 'true'",
  );
  expect(step).toContain('CRM_E2E_LOGIN');
  expect(step).toContain('CRM_E2E_PASSWORD');
  expect(step).not.toContain('CORGI_CRM_API_KEY');
  expect(step).not.toContain('CORGI_THIRTEEN_F_API_READ_TOKEN');
  expect(step).not.toContain('continue-on-error');

  expect(frontComponentSmoke).toContain(
    "const APPROVED_ORIGIN = 'https://crm.corgiinvest.com'",
  );
  expect(frontComponentSmoke).toContain('VerifyCorgiThirteenFRenderedPage');
  expect(frontComponentSmoke).toContain(
    'getPageLayouts(pageLayoutType: STANDALONE_PAGE)',
  );
  expect(frontComponentSmoke).toContain(
    "'6404c75f-c713-4db1-965d-6cf54178a18f'",
  );
  expect(frontComponentSmoke).toContain(
    'CORGI_CRM_EXPECTED_USER_WORKSPACE_ID',
  );
  expect(frontComponentSmoke).toContain('isImpersonating: false');
  expect(frontComponentSmoke).toContain('`/page/${pageLayout.id}`');
  expect(frontComponentSmoke).toContain(
    "page.getByRole('heading', { name: '13F', exact: true })",
  );
  expect(frontComponentSmoke).toContain(
    "input[aria-label=\"Search 13F data\"]",
  );
  expect(frontComponentSmoke).toContain("'FrontComponent error:'");
  expect(frontComponentSmoke).toContain('MutationObserver');
  expect(frontComponentSmoke).toContain(
    'CORGI_THIRTEEN_F_FRONT_COMPONENT_SMOKE',
  );
  expect(frontComponentSmoke).toContain("?.trim() !== 'true'");
  expect(frontComponentSmoke).not.toContain('test.skip();');
  expect(frontComponentSmoke).not.toContain('Authorization:');
});

test('proves the exact tenant and native firm-first journeys through the CRM app route', () => {
  expect(smoke).toContain(
    "const APPROVED_ORIGIN = 'https://crm.corgiinvest.com'",
  );
  expect(smoke).toContain("const DATA_PLANE_PATH = '/s/thirteen-f/query'");
  expect(smoke).toContain('VerifyCorgiThirteenFDataPlaneTenant');
  expect(smoke).toContain('CORGI_CRM_EXPECTED_USER_WORKSPACE_ID');
  expect(smoke).toContain('isImpersonating: false');
  expect(smoke).toContain('page.request.post');
  for (const action of [
    'summary',
    'firms',
    'firm',
    'holdings',
    'search',
    'holders',
  ]) {
    expect(smoke).toContain(`action: '${action}'`);
  }
  expect(smoke).toContain("const STABLE_TICKER_QUERY = 'ITA'");
  expect(smoke).toContain('MINIMUM_COUNTS');
  expect(smoke).toContain('assertNoRawFileArtifacts');
  expect(smoke).toContain('RAW_FILE_ARTIFACT_PATTERN');
  expect(smoke).not.toContain('admin.corgiinvest.com');
  expect(smoke).not.toContain('CORGI_THIRTEEN_F_API_READ_TOKEN');
  expect(smoke).not.toContain('Authorization:');
});

test('is opt-in and fails rather than silently skipping when explicitly enabled', () => {
  expect(smoke).toContain('CORGI_THIRTEEN_F_DATA_PLANE_SMOKE');
  expect(smoke).toContain("?.trim() !== 'true'");
  expect(smoke).toContain('test.skip(');
  expect(smoke).toContain(
    'throw new Error(`${label} failed with HTTP ${response.status()}`)',
  );
  expect(smoke).not.toContain('test.skip();');
  expect(smoke).not.toContain('continue-on-error');
});

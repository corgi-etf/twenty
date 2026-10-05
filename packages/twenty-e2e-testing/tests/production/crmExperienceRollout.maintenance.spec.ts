import { test } from '@playwright/test';
import {
  runExperienceRollout,
  assertRolloutSessionLifetime,
} from './crmExperienceRollout.mjs';
import { requireProductionEnvironment } from './requireProductionEnvironment';

test.describe.configure({ retries: 0 });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(
  process.env.CRM_EXPERIENCE_ROLLOUT_ENABLED !== 'true',
  'CRM experience maintenance is workflow-only.',
);
test('executes the reviewed CRM experience rollout operation', async ({
  page,
}) => {
  const operationTimeout =
    (process.env.CRM_EXPERIENCE_DATASET === 'ownership' ? 120 : 20) * 60_000;
  test.setTimeout(operationTimeout);
  const environment = requireProductionEnvironment();
  if (environment.FRONTEND_BASE_URL !== environment.BACKEND_BASE_URL)
    throw new Error(
      'Maintenance requires the same approved frontend and backend origin',
    );
  assertRolloutSessionLifetime(
    (await page.context().cookies(environment.FRONTEND_BASE_URL)).map(
      ({ name, httpOnly, secure, domain, path, expires }) => ({
        name,
        httpOnly,
        secure,
        domain,
        path,
        expires,
      }),
    ),
    operationTimeout + 15 * 60_000,
  );
  const summary = await runExperienceRollout({
    request: page.request,
    options: {
      origin: new URL(environment.FRONTEND_BASE_URL).origin,
      operation: process.env.CRM_EXPERIENCE_OPERATION,
      dataset: process.env.CRM_EXPERIENCE_DATASET,
      deployedSha: process.env.CRM_DEPLOYED_SHA,
      workflowSha: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      expectedCompanyCount: Number(process.env.CRM_EXPERIENCE_COMPANY_COUNT),
      confirmation: process.env.CRM_EXPERIENCE_CONFIRMATION,
      reviewedDigest: process.env.CRM_EXPERIENCE_REVIEWED_DIGEST,
      previewRunId: process.env.CRM_EXPERIENCE_PREVIEW_RUN_ID,
      previewRunAttempt: process.env.CRM_EXPERIENCE_PREVIEW_RUN_ATTEMPT,
      manifestPath: process.env.CRM_EXPERIENCE_MANIFEST_PATH,
      outputDirectory: process.env.CRM_EXPERIENCE_OUTPUT_DIRECTORY,
    },
  });
  // Aggregate counts and digests only. Manifests and journals stay in private artifacts.
  console.log(JSON.stringify(summary));
});

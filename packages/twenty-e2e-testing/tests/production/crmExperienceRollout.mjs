import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const EXPERIENCE_ORIGIN = 'https://crm.corgiinvest.com';
export const EXPERIENCE_APP_ID = 'ca87ad48-b62a-41be-a790-7c17707ff1b4';
export const EXPERIENCE_VERSION = '1.3.0';
const stableJson = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
export const rolloutDigest = (value) =>
  createHash('sha256').update(stableJson(value)).digest('hex');
export const assertRolloutSessionLifetime = (
  cookies,
  minimumLifetimeMs,
  now = Date.now(),
) => {
  const session = cookies.find(({ name }) => name === '__Host-twenty-session');
  if (
    !session ||
    !session.httpOnly ||
    !session.secure ||
    session.path !== '/' ||
    session.domain !== new URL(EXPERIENCE_ORIGIN).hostname ||
    !Number.isFinite(session.expires) ||
    session.expires * 1000 <= now + minimumLifetimeMs
  )
    throw new Error(
      'A secure administrator session with enough remaining lifetime is required',
    );
};
export const validateRolloutOptions = (options) => {
  if (
    options.origin !== EXPERIENCE_ORIGIN ||
    !['preview', 'apply'].includes(options.operation) ||
    !['configuration', 'ownership', 'activities-allocations'].includes(
      options.dataset,
    )
  )
    throw new Error('Unsupported CRM rollout origin, operation, or dataset');
  if (
    !/^[a-f0-9]{40}$/.test(options.deployedSha) ||
    options.workflowSha !== options.deployedSha
  )
    throw new Error(
      'The workflow revision must exactly match both deployed CRM services',
    );
  for (const value of [options.runId, options.runAttempt])
    if (!/^[1-9]\d*$/.test(value))
      throw new Error('Workflow execution identity is required');
  if (
    options.operation === 'apply' &&
    (!/^[a-f0-9]{64}$/.test(options.reviewedDigest ?? '') ||
      !/^[1-9]\d*$/.test(options.previewRunId ?? '') ||
      !/^[1-9]\d*$/.test(options.previewRunAttempt ?? '') ||
      options.confirmation !== 'APPLY_REVIEWED_CRM_EXPERIENCE')
  )
    throw new Error(
      'Apply requires the reviewed preview run, attempt, digest, and explicit confirmation',
    );
  if (
    options.operation === 'preview' &&
    options.dataset === 'ownership' &&
    (!Number.isSafeInteger(options.expectedCompanyCount) ||
      options.expectedCompanyCount < 1)
  )
    throw new Error(
      'Ownership preview requires an exact positive expected company count',
    );
};
export const validateReviewedRollout = (
  bundle,
  options,
  workspaceId,
  telegramDigest,
) => {
  const { digest, ...body } = bundle;
  if (digest !== rolloutDigest(body) || digest !== options.reviewedDigest)
    throw new Error('Reviewed rollout artifact digest does not match');
  if (
    bundle.version !== 1 ||
    bundle.origin !== options.origin ||
    bundle.dataset !== options.dataset ||
    bundle.workspaceId !== workspaceId ||
    bundle.deployedSha !== options.deployedSha ||
    bundle.workflowSha !== options.workflowSha ||
    bundle.previewRunId !== options.previewRunId ||
    bundle.previewRunAttempt !== options.previewRunAttempt ||
    bundle.appVersion !== EXPERIENCE_VERSION ||
    bundle.telegramDigest !== telegramDigest
  )
    throw new Error(
      'Reviewed rollout artifact identity, release, or Telegram baseline changed',
    );
};
const loadModules = async () => ({
  api: await import('../../../corgi-crm-workspace-config/src/twenty-api.ts'),
  config:
    await import('../../../corgi-crm-workspace-config/src/experience-config.ts'),
  owners:
    await import('../../../corgi-crm-workspace-config/src/company-ownership-backfill.ts'),
  ownerApi:
    await import('../../../corgi-crm-workspace-config/src/company-ownership-api.ts'),
  files:
    await import('../../../corgi-crm-workspace-config/src/experience-cli-runtime.ts'),
  backfill:
    await import('../../../twenty-apps/internal/corgi-crm/scripts/experience-backfill.mjs'),
});
export const runExperienceRollout = async ({
  request,
  options,
  modules: suppliedModules,
}) => {
  validateRolloutOptions(options);
  const modules = suppliedModules ?? (await loadModules());
  const requestGate = modules.api.createWorkspaceConfigRequestGate();
  const { workspaceId } = await modules.api.assertWorkspaceConfigTenant({
    request,
    origin: options.origin,
    requestGate,
  });
  const graphql = async (query, variables = {}, endpoint = '/metadata') => {
    const response = await requestGate(() =>
      request.post(`${options.origin}${endpoint}`, {
        headers: { Origin: options.origin },
        data: { query, variables },
        maxRedirects: 0,
        timeout: 30_000,
      }),
    );
    try {
      if (!response.ok())
        throw new Error(
          `CRM maintenance request failed: HTTP ${response.status()}`,
        );
      const body = await response.json();
      if (!body.data || body.errors?.length)
        throw new Error('CRM maintenance returned GraphQL errors');
      return body.data;
    } finally {
      await response.dispose();
    }
  };
  const releaseState = async () => {
    const data = await graphql(`query ExperienceRolloutRelease {
      currentWorkspace {id}
      currentUser {currentUserWorkspace {permissionFlags}}
      findOneApplication(universalIdentifier:"${EXPERIENCE_APP_ID}") {
        id universalIdentifier version applicationVariables {key value}
      }
    }`);
    const app = data.findOneApplication;
    const permissions = data.currentUser?.currentUserWorkspace?.permissionFlags;
    if (
      data.currentWorkspace?.id !== workspaceId ||
      app?.universalIdentifier !== EXPERIENCE_APP_ID ||
      app.version !== EXPERIENCE_VERSION ||
      !Array.isArray(permissions) ||
      !['APPLICATIONS', 'WORKFLOWS', 'DATA_MODEL'].every((flag) =>
        permissions.includes(flag),
      )
    )
      throw new Error(
        'Installed app release, workspace, or maintenance administrator permissions do not match',
      );
    const telegram = app.applicationVariables
      .filter(({ key }) => key.startsWith('CORGI_CRM_TELEGRAM_'))
      .sort((a, b) => a.key.localeCompare(b.key));
    if (!telegram.length) throw new Error('Telegram baseline is missing');
    return { telegramDigest: rolloutDigest(telegram) };
  };
  const baseline = await releaseState();
  const connection = { request, origin: options.origin, requestGate };
  const configApi = () =>
    modules.api.createTwentyWorkspaceConfigApi({
      ...connection,
      backendBaseUrl: options.origin,
      frontendBaseUrl: options.origin,
      checkpointFilePath: '',
    });
  const backfillApi = () =>
    modules.backfill.createExperienceBackfillRepository({
      url: options.origin,
      graphql,
    });
  await modules.files.protectedArtifactPath(
    join(options.outputDirectory, 'manifest.json'),
  );
  await mkdir(options.outputDirectory, { recursive: true, mode: 0o700 });
  if (options.operation === 'preview') {
    let manifest;
    if (options.dataset === 'configuration') {
      manifest = modules.config.buildExperienceConfigManifest(
        await configApi().listWorkspaceConfigSnapshot(),
        workspaceId,
      );
    } else if (options.dataset === 'ownership') {
      manifest = modules.owners.buildOwnershipManifest({
        snapshot: await modules.ownerApi
          .createOwnershipBackfillApi(connection)
          .readSnapshot(),
        workspaceId,
        expectedCompanyCount: options.expectedCompanyCount,
      });
    } else {
      const api = backfillApi();
      manifest = modules.backfill.buildExperienceBackfill({
        activities: await api.list('outreachActivity'),
        allocations: await api.list('companyAllocation'),
        workspaceId,
      });
    }
    const body = {
      version: 1,
      origin: options.origin,
      workspaceId,
      dataset: options.dataset,
      deployedSha: options.deployedSha,
      workflowSha: options.workflowSha,
      previewRunId: options.runId,
      previewRunAttempt: options.runAttempt,
      appVersion: EXPERIENCE_VERSION,
      telegramDigest: baseline.telegramDigest,
      manifestDigest:
        options.dataset === 'activities-allocations'
          ? manifest.digest
          : modules.owners.ownershipManifestDigest(manifest),
      manifest,
    };
    const bundle = { ...body, digest: rolloutDigest(body) };
    if ((await releaseState()).telegramDigest !== baseline.telegramDigest)
      throw new Error('Telegram baseline changed during preview');
    await modules.files.writeNewArtifact(
      join(options.outputDirectory, 'manifest.json'),
      bundle,
    );
    return {
      operation: 'preview',
      dataset: options.dataset,
      digest: bundle.digest,
      phase: manifest.phase,
      operations:
        manifest.operations?.length ?? manifest.preview?.additions.length,
      unresolved:
        manifest.unresolved?.length ?? manifest.preview?.review.length ?? 0,
    };
  }
  const bundle = await modules.files.readArtifact(options.manifestPath);
  validateReviewedRollout(
    bundle,
    options,
    workspaceId,
    baseline.telegramDigest,
  );
  const journal = await modules.files.openDurableJournal(
    join(options.outputDirectory, 'journal.jsonl'),
  );
  if (journal.entries.length) {
    await journal.close();
    throw new Error('A fresh rollout journal is required');
  }
  let result;
  try {
    if (options.dataset === 'configuration') {
      result = await modules.config.applyExperienceConfigManifest({
        api: configApi(),
        manifest: bundle.manifest,
        reviewedDigest: bundle.manifestDigest,
        workspaceId,
        appendJournal: journal.append,
        // The REST metadata PATCH answers 200 while silently discarding
        // openRecordIn on standard objects, so company and person stayed on
        // USER_CHOICE while the journal recorded them as confirmed. Use the
        // mutation the product itself uses, and trust the returned value
        // rather than the status code.
        updateObjectOpenRecordIn: async (id) => {
          const response = await requestGate(() =>
            request.post(`${options.origin}/metadata`, {
              headers: { Origin: options.origin },
              data: {
                operationName: 'UpdateManagedObjectOpenRecordIn',
                query: `
                  mutation UpdateManagedObjectOpenRecordIn(
                    $idToUpdate: UUID!
                    $updatePayload: UpdateObjectPayload!
                  ) {
                    updateOneObject(
                      input: { id: $idToUpdate, update: $updatePayload }
                    ) {
                      id
                      openRecordIn
                    }
                  }
                `,
                variables: {
                  idToUpdate: id,
                  updatePayload: { openRecordIn: 'RECORD_PAGE' },
                },
              },
              maxRedirects: 0,
              timeout: 30_000,
            }),
          );
          try {
            if (!response.ok())
              throw new Error('Object profile default update failed');
            const body = await response.json();
            if (Array.isArray(body?.errors) && body.errors.length > 0)
              throw new Error(
                `Object profile default update returned GraphQL errors: ${body.errors
                  .map((error) => error?.message)
                  .filter(Boolean)
                  .join('; ')}`,
              );
            const updated = body?.data?.updateOneObject;
            if (updated?.id !== id)
              throw new Error(
                'Object profile default update returned an unexpected object',
              );
            if (updated?.openRecordIn !== 'RECORD_PAGE')
              throw new Error(
                `Object profile default did not persist: openRecordIn is ${updated?.openRecordIn}`,
              );
          } finally {
            await response.dispose();
          }
        },
      });
    } else if (options.dataset === 'ownership') {
      result = await modules.owners.applyOwnershipManifest({
        api: modules.ownerApi.createOwnershipBackfillApi(connection),
        manifest: bundle.manifest,
        reviewedDigest: bundle.manifestDigest,
        workspaceId,
        journal: [],
        appendJournal: journal.append,
      });
    } else {
      modules.backfill.validateBackfillManifest(
        bundle.manifest,
        workspaceId,
        bundle.manifestDigest,
      );
      const api = backfillApi();
      const identity = await api.resolveBackfillFunction(workspaceId);
      if (
        identity.activeDigest &&
        identity.activeDigest !== bundle.manifestDigest
      )
        throw new Error('A different maintenance manifest is still approved');
      let updated = 0;
      let unchanged = 0;
      try {
        await api.approve(identity.applicationId, bundle.manifestDigest);
        for (
          let index = 0;
          index < bundle.manifest.operations.length;
          index++
        ) {
          await journal.append({
            kind: 'intent',
            index,
            digest: bundle.digest,
            operation: bundle.manifest.operations[index],
          });
          const outcome = await api.execute(
            identity.functionId,
            bundle.manifest,
            index,
          );
          await journal.append({
            kind: 'result',
            index,
            digest: bundle.digest,
            ...outcome,
          });
          if (!['updated', 'unchanged'].includes(outcome.status))
            throw new Error(
              'Backfill source changed; review the journal and create a fresh preview',
            );
          if (outcome.status === 'updated') updated++;
          else unchanged++;
        }
        result = { updated, unchanged };
      } finally {
        await api.approve(identity.applicationId, '');
      }
    }
    if (options.dataset === 'configuration') {
      result = { ...result, verified: result.remainingOperations === 0 };
    }
    await modules.files.writeNewArtifact(
      join(options.outputDirectory, 'result.json'),
      {
        operation: 'apply',
        dataset: options.dataset,
        digest: bundle.digest,
        result,
      },
    );
    return {
      operation: 'apply',
      dataset: options.dataset,
      digest: bundle.digest,
      result,
    };
  } finally {
    await journal.close();
    if ((await releaseState()).telegramDigest !== baseline.telegramDigest)
      throw new Error(
        'Telegram baseline changed during maintenance; review before continuing',
      );
  }
};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const repositoryRoot = join(__dirname, '../../../..');
const productionLocalsSource = readFileSync(
  join(repositoryRoot, 'infra/aws/production/locals.tf'),
  'utf8',
);
const productionEcsSource = readFileSync(
  join(repositoryRoot, 'infra/aws/production/ecs.tf'),
  'utf8',
);
const deploymentWorkflowSource = readFileSync(
  join(repositoryRoot, '.github/workflows/crm-deploy.yml'),
  'utf8',
);
const appDeploymentWorkflowSource = readFileSync(
  join(repositoryRoot, '.github/workflows/corgi-crm-app-production.yml'),
  'utf8',
);

test('pins trusted logic functions locally while keeping the code interpreter disabled for both Terraform task definitions', () => {
  expect(productionLocalsSource).toContain(
    '{ name = "LOGIC_FUNCTION_TYPE", value = "LOCAL" }',
  );
  expect(productionLocalsSource).toContain(
    '{ name = "CODE_INTERPRETER_TYPE", value = "DISABLED" }',
  );
  expect(
    productionEcsSource.match(
      /environment = concat\(local\.common_environment,/g,
    ),
  ).toHaveLength(2);
});

test('forces and verifies the exact runtime contract on every deployed server and worker revision', () => {
  expect(deploymentWorkflowSource).toContain('LOGIC_FUNCTION_TYPE: LOCAL');
  expect(deploymentWorkflowSource).toContain('CODE_INTERPRETER_TYPE: DISABLED');
  expect(deploymentWorkflowSource).toContain(
    '--arg logic_function_type "${LOGIC_FUNCTION_TYPE}"',
  );
  expect(deploymentWorkflowSource).toContain(
    '--arg code_interpreter_type "${CODE_INTERPRETER_TYPE}"',
  );
  expect(deploymentWorkflowSource).toContain(
    '{name: "LOGIC_FUNCTION_TYPE", value: $logic_function_type}',
  );
  expect(deploymentWorkflowSource).toMatch(
    /\{\s*name: "CODE_INTERPRETER_TYPE",\s*value: \$code_interpreter_type\s*\}/,
  );

  expect(
    deploymentWorkflowSource.match(/assert_runtime_environment \\/g),
  ).toHaveLength(2);
  expect(
    deploymentWorkflowSource.match(
      /verify_service \\\n+\s+"\$\{(?:SERVER|WORKER)_SERVICE\}" \\\n+\s+"\$\{NEW_(?:SERVER|WORKER)_ARN\}" \\\n+\s+"\$\{(?:SERVER|WORKER)_CONTAINER\}"/g,
    ),
  ).toHaveLength(2);
});

test('deploys a new task revision when either runtime configuration source changes', () => {
  expect(deploymentWorkflowSource).toContain('infra/aws/production/locals.tf');
  expect(deploymentWorkflowSource).toContain(
    '.github/workflows/crm-deploy.yml',
  );
  expect(deploymentWorkflowSource).toContain('RUNTIME_CONFIG_CHANGED=true');
  expect(deploymentWorkflowSource).toContain(
    '[[ "${RUNTIME_CONFIG_CHANGED}" == "true" ]]',
  );
});

test('blocks app credentials until both live services prove the exact runtime contract', () => {
  const runtimePreflightIndex = appDeploymentWorkflowSource.indexOf(
    'Prove every live task uses the approved deployed SHA and runtime configuration',
  );
  const credentialAcquisitionIndex = appDeploymentWorkflowSource.indexOf(
    'Acquire a short-lived deployment API key',
  );

  expect(runtimePreflightIndex).toBeGreaterThan(-1);
  expect(credentialAcquisitionIndex).toBeGreaterThan(runtimePreflightIndex);
  expect(appDeploymentWorkflowSource).toContain(
    'aws ecs describe-task-definition',
  );
  expect(appDeploymentWorkflowSource).toContain(
    '.taskDefinitionArn == $task_definition',
  );
  expect(appDeploymentWorkflowSource).toContain('.imageDigest == $digest');
  expect(appDeploymentWorkflowSource).toMatch(
    /map\(select\(\.name == "LOGIC_FUNCTION_TYPE"\)\)\) == \[\{\s*name: "LOGIC_FUNCTION_TYPE",\s*value: "LOCAL"\s*\}\]/,
  );
  expect(appDeploymentWorkflowSource).toMatch(
    /map\(select\(\.name == "CODE_INTERPRETER_TYPE"\)\)\) == \[\{\s*name: "CODE_INTERPRETER_TYPE",\s*value: "DISABLED"\s*\}\]/,
  );
  expect(
    appDeploymentWorkflowSource.match(
      /assert_stable_service_tasks "\$\{(?:SERVER|WORKER)_SERVICE\}" "\$\{(?:SERVER|WORKER)_CONTAINER\}"/g,
    ),
  ).toHaveLength(2);
});

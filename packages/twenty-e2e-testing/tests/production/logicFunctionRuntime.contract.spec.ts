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

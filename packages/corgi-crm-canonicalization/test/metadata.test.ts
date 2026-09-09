import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertManagedMetadataConverged,
  buildMetadataPlan,
  type MetadataObject,
} from '../src/metadata.ts';

const metadata = (): MetadataObject[] => [
  {
    id: 'company-object',
    nameSingular: 'company',
    fields: [
      {
        id: 'status',
        name: 'fetchStatus',
        label: 'Fetch Status',
        type: 'TEXT',
      },
      {
        id: 'tags',
        name: 'fetchTags',
        label: 'Fetch Tags',
        type: 'MULTI_SELECT',
      },
      {
        id: 'legacy-site',
        name: 'legacyWebsite',
        label: 'Legacy Website',
        type: 'TEXT',
      },
    ],
  },
  {
    id: 'person-object',
    nameSingular: 'person',
    fields: [
      { id: 'city', name: 'legacyCity', label: 'Legacy City', type: 'TEXT' },
      { id: 'email', name: 'legacyEmail', label: 'Legacy Email', type: 'TEXT' },
    ],
  },
  {
    id: 'holding-object',
    nameSingular: 'holdingObservation',
    fields: [
      { id: 'date', name: 'sourceDate', label: 'Source Date', type: 'DATE' },
      { id: 'raw', name: 'rawData', label: 'Raw Data', type: 'TEXT' },
    ],
  },
  {
    id: 'wholesaler-object',
    nameSingular: 'wholesaler',
    fields: [
      { id: 'role', name: 'fetchRole', label: 'Fetch Role', type: 'TEXT' },
    ],
  },
  { id: 'task-object', nameSingular: 'task', fields: [] },
  { id: 'outreach-object', nameSingular: 'outreachActivity', fields: [] },
  {
    id: 'assignment-object',
    nameSingular: 'leadAssignment',
    fields: [],
  },
];

test('metadata plan renames useful fields and creates explicit business fields', () => {
  const plan = buildMetadataPlan(metadata());

  assert.deepEqual(
    plan.renames.map(({ objectName, currentName, targetName }) => [
      objectName,
      currentName,
      targetName,
    ]),
    [
      ['company', 'fetchStatus', 'leadStatus'],
      ['company', 'fetchTags', 'tags'],
      ['holdingObservation', 'sourceDate', 'asOfDate'],
      ['person', 'legacyCity', 'city'],
      ['wholesaler', 'fetchRole', 'role'],
    ],
  );
  assert.ok(
    plan.creates.some(
      ({ objectName, name }) =>
        objectName === 'company' && name === 'description',
    ),
  );
  assert.ok(
    plan.creates.some(
      ({ objectName, name }) =>
        objectName === 'company' && name === 'assetsUnderManagement',
    ),
  );
  assert.ok(
    plan.creates.some(
      ({ objectName, name }) =>
        objectName === 'person' && name === 'otherContactDetails',
    ),
  );
  assert.ok(
    plan.creates.some(
      ({ objectName, name }) =>
        objectName === 'company' && name === 'websiteNotes',
    ),
  );
  assert.ok(
    plan.creates.some(
      ({ objectName, name }) =>
        objectName === 'holdingObservation' && name === 'averagePrice',
    ),
  );
  assert.ok(
    plan.creates.some(
      ({ objectName, name }) =>
        objectName === 'holdingObservation' && name === 'form13f',
    ),
  );
  assert.equal(
    plan.creates.some(
      ({ objectName, name }) =>
        (objectName === 'person' && name === 'alternateNames') ||
        (objectName === 'holdingObservation' &&
          name === 'alternateStateRegions'),
    ),
    false,
  );
  assert.ok(
    plan.creates.some(
      ({ objectName, name }) => objectName === 'task' && name === 'wholesaler',
    ),
  );
  assert.ok(
    plan.creates.some(
      ({ objectName, name }) =>
        objectName === 'outreachActivity' && name === 'followUpTask',
    ),
  );

  const retainedNames = [
    ...plan.renames.map(({ targetName }) => targetName),
    ...plan.creates.map(({ name }) => name),
  ];
  assert.equal(
    retainedNames.some((name) =>
      /fetch|legacy|import|source|migration|batch|hmac|raw/i.test(name),
    ),
    false,
  );
  assert.equal(
    plan.renames.some(({ currentName }) => currentName === 'legacyWebsite'),
    false,
  );
  assert.equal(
    plan.renames.some(({ currentName }) => currentName === 'rawData'),
    false,
  );
});

test('metadata planning fails closed on an incompatible neutral target', () => {
  const objects = metadata();
  objects[0]?.fields.push({
    id: 'wrong-description',
    name: 'description',
    label: 'Description',
    type: 'NUMBER',
  });

  assert.throws(
    () => buildMetadataPlan(objects),
    /company\.description.*expected TEXT/i,
  );
});

test('metadata planning is idempotent after fields are neutralized', () => {
  const first = buildMetadataPlan(metadata());
  const objects = metadata();

  for (const rename of first.renames) {
    const object = objects.find(
      ({ nameSingular }) => nameSingular === rename.objectName,
    );
    const field = object?.fields.find(
      ({ name }) => name === rename.currentName,
    );
    if (field) {
      field.name = rename.targetName;
      field.label = rename.targetLabel;
    }
  }
  for (const create of first.creates) {
    objects
      .find(({ nameSingular }) => nameSingular === create.objectName)
      ?.fields.push({
        id: `created-${create.name}`,
        name: create.name,
        label: create.label,
        type: create.type,
        relationTargetObjectMetadataId: create.relationTargetObjectMetadataId,
        settings:
          create.type === 'RELATION'
            ? { relationType: create.relationType }
            : undefined,
      });
  }

  assert.deepEqual(buildMetadataPlan(objects), { renames: [], creates: [] });
});

test('live REST relation settings are recognized on interrupted reruns', () => {
  const objects = metadata();
  objects
    .find(({ nameSingular }) => nameSingular === 'task')
    ?.fields.push({
      id: 'task-wholesaler',
      name: 'wholesaler',
      label: 'Wholesaler',
      type: 'RELATION',
      settings: {
        relationTargetObjectMetadataId: 'wholesaler-object',
        relationType: 'MANY_TO_ONE',
      },
    });

  const plan = buildMetadataPlan(objects);

  assert.equal(
    plan.creates.some(
      ({ objectName, name }) => objectName === 'task' && name === 'wholesaler',
    ),
    false,
  );
});

test('relation source and inverse cardinalities must match the managed schema', () => {
  const objects = metadata();
  const first = buildMetadataPlan(objects);
  for (const rename of first.renames) {
    const field = objects
      .find(({ nameSingular }) => nameSingular === rename.objectName)
      ?.fields.find(({ id }) => id === rename.fieldId);
    assert.ok(field);
    field.name = rename.targetName;
    field.label = rename.targetLabel;
  }
  for (const create of first.creates) {
    const source = objects.find(({ id }) => id === create.objectMetadataId);
    assert.ok(source);
    source.fields.push({
      id: `created-${create.name}`,
      name: create.name,
      label: create.label,
      type: create.type,
      relationTargetObjectMetadataId: create.relationTargetObjectMetadataId,
      settings:
        create.type === 'RELATION'
          ? { relationType: create.relationType }
          : undefined,
    });
    if (create.relationTargetObjectMetadataId) {
      const target = objects.find(
        ({ id }) => id === create.relationTargetObjectMetadataId,
      );
      assert.ok(target);
      target.fields.push({
        id: `inverse-${create.name}`,
        name: `${create.name}Inverse`,
        label: create.targetFieldLabel ?? '',
        type: 'RELATION',
        relationTargetObjectMetadataId: source.id,
        settings: { relationType: 'MANY_TO_ONE' },
      });
    }
  }

  assert.throws(
    () => assertManagedMetadataConverged(objects),
    /relation did not converge/,
  );
});

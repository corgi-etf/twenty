import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bootstrapSchema,
  type MetadataApi,
  type MetadataObject,
} from '../src/schema-bootstrap.ts';
import type { FieldDefinition, ObjectDefinition } from '../src/schema.ts';

class FakeMetadataApi implements MetadataApi {
  objects: MetadataObject[] = [
    {
      id: 'company-id',
      nameSingular: 'company',
      namePlural: 'companies',
      fields: [],
    },
  ];
  createdFields: FieldDefinition[] = [];

  async listMetadataObjects() {
    return structuredClone(this.objects);
  }

  async createMetadataObject(definition: ObjectDefinition) {
    this.objects.push({
      id: `${definition.nameSingular}-id`,
      nameSingular: definition.nameSingular,
      namePlural: definition.namePlural,
      fields: [],
    });
  }

  async createMetadataField(
    definition: FieldDefinition,
    _objectId: string,
    targetObjectId?: string,
  ) {
    this.createdFields.push(definition);
    this.objects
      .find(({ nameSingular }) => nameSingular === definition.objectName)!
      .fields!.push({
        id: `${definition.name}-id`,
        name: definition.name,
        type: definition.type,
        isUnique: definition.isUnique ?? false,
        options: definition.options ?? null,
        settings: definition.relation
          ? { relationType: definition.relation.type }
          : null,
        relationTargetObjectMetadataId: targetObjectId ?? null,
      });
  }
}

test('schema bootstrap creates objects before scalar fields and relations and is idempotent', async () => {
  const api = new FakeMetadataApi();
  const schema = {
    objects: [
      {
        nameSingular: 'leadAssignment',
        namePlural: 'leadAssignments',
        labelSingular: 'Lead Assignment',
        labelPlural: 'Lead Assignments',
        icon: 'IconUserShare',
      },
    ],
    fields: [
      {
        objectName: 'leadAssignment',
        name: 'legacyFetchId',
        label: 'Legacy Fetch ID',
        type: 'TEXT',
        isUnique: true,
      },
      {
        objectName: 'leadAssignment',
        name: 'company',
        label: 'Company',
        type: 'RELATION',
        relation: {
          targetObjectName: 'company',
          targetFieldLabel: 'Lead Assignments',
          targetFieldIcon: 'IconLink',
          type: 'MANY_TO_ONE' as const,
        },
      },
    ],
  };

  assert.deepEqual(await bootstrapSchema(schema, api), {
    objectsCreated: 1,
    fieldsCreated: 2,
  });
  assert.deepEqual(
    api.createdFields.map(({ name }) => name),
    ['legacyFetchId', 'company'],
  );
  assert.deepEqual(await bootstrapSchema(schema, api), {
    objectsCreated: 0,
    fieldsCreated: 0,
  });
});

test('schema bootstrap rejects incompatible existing metadata without writing', async () => {
  const api = new FakeMetadataApi();
  api.objects[0]!.fields = [
    { id: 'field-id', name: 'legacyFetchId', type: 'NUMBER' },
  ];

  await assert.rejects(
    () =>
      bootstrapSchema(
        {
          objects: [],
          fields: [
            {
              objectName: 'company',
              name: 'legacyFetchId',
              label: 'Legacy Fetch ID',
              type: 'TEXT',
            },
          ],
        },
        api,
      ),
    /metadata collision/i,
  );
  assert.deepEqual(api.createdFields, []);
});

test('schema bootstrap rejects unique and multi-select option drift', async () => {
  const uniqueApi = new FakeMetadataApi();
  uniqueApi.objects[0]!.fields = [
    {
      id: 'legacy-id',
      name: 'legacyFetchId',
      type: 'TEXT',
      isUnique: false,
    },
  ];

  await assert.rejects(
    () =>
      bootstrapSchema(
        {
          objects: [],
          fields: [
            {
              objectName: 'company',
              name: 'legacyFetchId',
              label: 'Legacy Fetch ID',
              type: 'TEXT',
              isUnique: true,
            },
          ],
        },
        uniqueApi,
      ),
    /legacyFetchId.*isUnique/i,
  );

  const optionsApi = new FakeMetadataApi();
  optionsApi.objects[0]!.fields = [
    {
      id: 'tags-id',
      name: 'fetchTags',
      type: 'MULTI_SELECT',
      isUnique: false,
      options: [
        {
          id: 'option-id',
          value: 'RIA',
          label: 'Stale label',
          position: 0,
          color: 'blue',
          apiOnlyProperty: true,
        },
      ],
    },
  ];

  await assert.rejects(
    () =>
      bootstrapSchema(
        {
          objects: [],
          fields: [
            {
              objectName: 'company',
              name: 'fetchTags',
              label: 'Fetch Tags',
              type: 'MULTI_SELECT',
              options: [
                {
                  id: 'option-id',
                  value: 'RIA',
                  label: 'RIA',
                  position: 0,
                  color: 'blue',
                },
              ],
            },
          ],
        },
        optionsApi,
      ),
    /fetchTags.*options/i,
  );
});

test('schema bootstrap accepts normalized equivalent multi-select options', async () => {
  const api = new FakeMetadataApi();
  api.objects[0]!.fields = [
    {
      id: 'tags-id',
      name: 'fetchTags',
      type: 'MULTI_SELECT',
      isUnique: false,
      options: [
        {
          id: 'second-id',
          value: 'SECOND',
          label: 'Second',
          position: 1,
          color: 'green',
        },
        {
          id: 'first-id',
          value: 'FIRST',
          label: 'First',
          position: 0,
          color: 'blue',
          apiOnlyProperty: true,
        },
      ],
    },
  ];

  assert.deepEqual(
    await bootstrapSchema(
      {
        objects: [],
        fields: [
          {
            objectName: 'company',
            name: 'fetchTags',
            label: 'Fetch Tags',
            type: 'MULTI_SELECT',
            options: [
              {
                id: 'first-id',
                value: 'FIRST',
                label: 'First',
                position: 0,
                color: 'blue',
              },
              {
                id: 'second-id',
                value: 'SECOND',
                label: 'Second',
                position: 1,
                color: 'green',
              },
            ],
          },
        ],
      },
      api,
    ),
    { objectsCreated: 0, fieldsCreated: 0 },
  );
});

test('schema bootstrap rejects relation cardinality and target drift', async () => {
  const schema = {
    objects: [
      {
        nameSingular: 'wholesaler',
        namePlural: 'wholesalers',
        labelSingular: 'Wholesaler',
        labelPlural: 'Wholesalers',
        icon: 'IconUsers',
      },
    ],
    fields: [
      {
        objectName: 'company',
        name: 'historicalOwner',
        label: 'Historical Owner',
        type: 'RELATION',
        relation: {
          targetObjectName: 'wholesaler',
          targetFieldLabel: 'Companies',
          targetFieldIcon: 'IconLink',
          type: 'MANY_TO_ONE' as const,
        },
      },
    ],
  };
  const cardinalityApi = new FakeMetadataApi();
  cardinalityApi.objects.push({
    id: 'wholesaler-id',
    nameSingular: 'wholesaler',
    namePlural: 'wholesalers',
    fields: [],
  });
  cardinalityApi.objects[0]!.fields = [
    {
      id: 'owner-id',
      name: 'historicalOwner',
      type: 'RELATION',
      isUnique: false,
      settings: { relationType: 'ONE_TO_MANY' },
      relationTargetObjectMetadataId: 'wholesaler-id',
    },
  ];

  await assert.rejects(
    () => bootstrapSchema(schema, cardinalityApi),
    /historicalOwner.*cardinality/i,
  );

  const targetApi = new FakeMetadataApi();
  targetApi.objects.push({
    id: 'wholesaler-id',
    nameSingular: 'wholesaler',
    namePlural: 'wholesalers',
    fields: [],
  });
  targetApi.objects[0]!.fields = [
    {
      id: 'owner-id',
      name: 'historicalOwner',
      type: 'RELATION',
      isUnique: false,
      settings: { relationType: 'MANY_TO_ONE' },
      relationTargetObjectMetadataId: 'company-id',
    },
  ];

  await assert.rejects(
    () => bootstrapSchema(schema, targetApi),
    /historicalOwner.*target/i,
  );
});

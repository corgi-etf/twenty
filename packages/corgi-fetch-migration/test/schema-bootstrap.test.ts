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

  async createMetadataField(definition: FieldDefinition) {
    this.createdFields.push(definition);
    this.objects
      .find(({ nameSingular }) => nameSingular === definition.objectName)!
      .fields!.push({
        id: `${definition.name}-id`,
        name: definition.name,
        type: definition.type,
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

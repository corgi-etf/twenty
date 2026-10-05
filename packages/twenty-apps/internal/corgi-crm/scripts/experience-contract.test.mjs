import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EXPERIENCE_SCHEMA,
  EXPERIENCE_TRIGGERS,
  verifyExperienceSchema,
} from './experience-contract.mjs';
const fixture = () => ({
  objects: Object.entries(EXPERIENCE_SCHEMA).map(
    ([nameSingular, contract]) => ({
      nameSingular,
      isActive: true,
      fieldsList: Object.entries(contract.fields).map(([name, type]) => ({
        id: `${nameSingular}-${name}`,
        name,
        type,
        isActive: true,
        writability: contract.protected?.includes(name)
          ? 'APPLICATION'
          : 'USER',
        isUIEditable: !contract.protected?.includes(name),
        relation: contract.relations?.[name]
          ? { targetObjectMetadata: { nameSingular: contract.relations[name] } }
          : undefined,
        options:
          name === 'status'
            ? [
                { value: 'OPEN' },
                { value: 'COMPLETED' },
                { value: 'CANCELLED' },
              ]
            : undefined,
      })),
      indexMetadataList: contract.unique
        ? [
            {
              isUnique: true,
              indexFieldMetadataList: contract.unique.map((name) => ({
                fieldMetadataId: `${nameSingular}-${name}`,
              })),
            },
          ]
        : [],
    }),
  ),
  application: {
    logicFunctions: [
      ...EXPERIENCE_TRIGGERS.map(
        ([universalIdentifier, name, databaseEventTriggerSettings]) => ({
          universalIdentifier,
          name,
          databaseEventTriggerSettings,
        }),
      ),
      {
        universalIdentifier: '40590631-e998-5a8b-a194-d8a7ec40fb5a',
        name: 'execute-experience-backfill',
      },
    ],
  },
});
test('accepts the complete additive schema, protected provenance and installed triggers', () => {
  const data = fixture();
  assert.doesNotThrow(() =>
    verifyExperienceSchema(data.objects, data.application),
  );
});
test('fails closed for missing contact links, user-writable provenance, duplicate identities or missing lifecycle triggers', () => {
  for (const change of [
    (data) => {
      data.objects.find(
        (row) => row.nameSingular === 'companyAllocation',
      ).fieldsList = data.objects
        .find((row) => row.nameSingular === 'companyAllocation')
        .fieldsList.filter((field) => field.name !== 'contact');
    },
    (data) => {
      data.objects
        .find((row) => row.nameSingular === 'outreachFollowUp')
        .fieldsList.find((field) => field.name === 'scheduledBy').writability =
        'USER';
    },
    (data) => {
      data.objects.find(
        (row) => row.nameSingular === 'companyOwnership',
      ).indexMetadataList = [];
    },
    (data) => {
      data.application.logicFunctions.shift();
    },
  ]) {
    const data = fixture();
    change(data);
    assert.throws(() => verifyExperienceSchema(data.objects, data.application));
  }
});

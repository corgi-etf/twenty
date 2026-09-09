import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ADDRESS_STATE_SUBFIELD,
  buildApprovedWholesalerTerritoryAssignments,
  buildTerritoryProjectionPlan,
  buildWholesalerTerritoryPlan,
  buildWorkspaceConfigPlan,
  type WorkspaceConfigSnapshot,
  type WorkspaceMetadataObject,
} from '../src/planner.ts';

const object = (
  nameSingular: string,
  fieldNames: Array<[string, string]> = [],
): WorkspaceMetadataObject => ({
  id: `${nameSingular}-object-id`,
  nameSingular,
  namePlural: nameSingular === 'person' ? 'people' : `${nameSingular}s`,
  fields: fieldNames.map(([name, type]) => ({
    id: `${nameSingular}-${name}-field-id`,
    name,
    label:
      name === 'activityType'
        ? 'Activity Type'
        : name === 'followUpDate'
          ? 'Follow-up Date'
          : name === 'occurredAt'
            ? 'Occurred At'
            : name === 'company'
              ? 'Company'
              : name === 'contact'
                ? 'Contact'
                : name === 'wholesaler'
                  ? 'Wholesaler'
                  : name === 'notes'
                    ? 'Notes'
                    : name === 'outcome'
                      ? 'Outcome'
                      : name,
    type,
  })),
});

const snapshot = (): WorkspaceConfigSnapshot => {
  const objects = [
    object('company', [
      ['name', 'FULL_NAME'],
      ['historicalOwner', 'RELATION'],
      ['address', 'ADDRESS'],
      ['firmPhone', 'TEXT'],
      ['linkedinLink', 'LINKS'],
      ['leadStatus', 'TEXT'],
    ]),
    object('person', [
      ['name', 'FULL_NAME'],
      ['company', 'RELATION'],
      ['jobTitle', 'TEXT'],
      ['emails', 'EMAILS'],
      ['phones', 'PHONES'],
      ['city', 'TEXT'],
      ['stateRegion', 'TEXT'],
      ['postalCode', 'TEXT'],
      ['linkedinLink', 'LINKS'],
      ['notes', 'TEXT'],
      ['createdAt', 'DATE_TIME'],
    ]),
    object('wholesaler'),
    object('salesTeam'),
    object('teamMembership'),
    object('task', [
      ['title', 'TEXT'],
      ['status', 'SELECT'],
      ['taskTargets', 'RELATION'],
      ['dueAt', 'DATE_TIME'],
      ['assignee', 'RELATION'],
      ['bodyV2', 'RICH_TEXT_V2'],
    ]),
    object('outreachActivity', [
      ['company', 'RELATION'],
      ['contact', 'RELATION'],
      ['wholesaler', 'RELATION'],
      ['activityType', 'TEXT'],
      ['outcome', 'TEXT'],
      ['followUpDate', 'DATE'],
      ['occurredAt', 'DATE_TIME'],
      ['notes', 'TEXT'],
      ['createdAt', 'DATE_TIME'],
    ]),
    object('workspaceMember'),
    object('importBatch'),
  ];
  const company = objects[0]!;
  const person = objects[1]!;
  const wholesaler = objects[2]!;
  const historicalOwner = company.fields.find(
    ({ name }) => name === 'historicalOwner',
  )!;
  historicalOwner.relationTargetObjectMetadataId = wholesaler.id;
  historicalOwner.settings = { relationType: 'MANY_TO_ONE' };
  const outreachActivity = objects[6]!;
  for (const [fieldName, targetObject] of [
    ['company', company],
    ['contact', person],
    ['wholesaler', wholesaler],
  ] as const) {
    const relationField = outreachActivity.fields.find(
      ({ name }) => name === fieldName,
    )!;
    relationField.relationTargetObjectMetadataId = targetObject.id;
    relationField.settings = { relationType: 'MANY_TO_ONE' };
  }
  const task = objects[5]!;
  const companyViewFields = company.fields.map((field, position) => ({
    id: `company-view-field-${position}`,
    fieldMetadataId: field.id,
    isVisible: true,
    position,
    size: 150,
  }));
  const personViewFields = person.fields.map((field, position) => ({
    id: `person-view-field-${position}`,
    fieldMetadataId: field.id,
    isVisible: true,
    position,
    size: 150,
  }));

  return {
    objects,
    views: [
      {
        id: 'company-index-view-id',
        universalIdentifier: 'company-index-view-universal-id',
        name: 'All Companies',
        objectMetadataId: company.id,
        type: 'TABLE',
        key: 'INDEX',
        icon: 'IconTable',
        position: 0,
        visibility: 'WORKSPACE',
        createdByUserWorkspaceId: null,
        viewFields: companyViewFields,
        viewFilters: [],
        viewSorts: [
          {
            id: 'old-company-sort-id',
            fieldMetadataId: company.fields[0]!.id,
            direction: 'DESC',
            subFieldName: null,
          },
        ],
      },
      {
        id: 'person-index-view-id',
        universalIdentifier: 'person-index-view-universal-id',
        name: 'All People',
        objectMetadataId: person.id,
        type: 'TABLE',
        key: 'INDEX',
        icon: 'IconTable',
        position: 1,
        visibility: 'WORKSPACE',
        createdByUserWorkspaceId: null,
        viewFields: personViewFields,
        viewFilters: [],
        viewSorts: [],
      },
      {
        id: 'assigned-to-me-view-id',
        universalIdentifier: '20202020-a007-4a07-8a07-ba5ca551aaed',
        name: 'Assigned to Me',
        objectMetadataId: task.id,
        type: 'TABLE',
        key: null,
        icon: 'IconUserCircle',
        position: 2,
        visibility: 'WORKSPACE',
        createdByUserWorkspaceId: null,
        viewFields: [],
        viewFilters: [
          {
            id: 'assignee-filter-id',
            fieldMetadataId: task.fields[4]!.id,
            operand: 'IS',
            value: {
              isCurrentWorkspaceMemberSelected: true,
              selectedRecordIds: [],
            },
            subFieldName: null,
          },
        ],
        viewSorts: [],
      },
    ],
    navigationMenuItems: [
      {
        id: 'companies-nav-id',
        type: 'OBJECT',
        userWorkspaceId: null,
        targetObjectMetadataId: company.id,
        viewId: null,
        folderId: null,
        position: 8,
      },
      {
        id: 'people-nav-id',
        type: 'OBJECT',
        userWorkspaceId: null,
        targetObjectMetadataId: objects[1]!.id,
        viewId: null,
        folderId: null,
        position: 9,
      },
      {
        id: 'tasks-nav-id',
        type: 'OBJECT',
        userWorkspaceId: null,
        targetObjectMetadataId: task.id,
        viewId: null,
        folderId: null,
        position: 10,
      },
      {
        id: 'import-batches-nav-id',
        type: 'OBJECT',
        userWorkspaceId: null,
        targetObjectMetadataId: objects[8]!.id,
        viewId: null,
        folderId: null,
        position: 11,
      },
    ],
  };
};

const addWorkspaceMemberRelation = (value: WorkspaceConfigSnapshot): void => {
  const wholesaler = value.objects[2]!;
  const workspaceMember = value.objects[7]!;
  wholesaler.fields.push({
    id: 'wholesaler-workspaceMember-field-id',
    name: 'workspaceMember',
    label: 'Workspace Member',
    type: 'RELATION',
    relationTargetObjectMetadataId: workspaceMember.id,
    relationTargetFieldMetadataId:
      'workspaceMember-wholesalerProfiles-field-id',
    settings: { relationType: 'MANY_TO_ONE' },
  });
  wholesaler.fields.push({
    id: 'wholesaler-territory-field-id',
    name: 'territory',
    label: 'Territory',
    type: 'TEXT',
  });
  workspaceMember.fields.push({
    id: 'workspaceMember-wholesalerProfiles-field-id',
    name: 'wholesalerProfiles',
    label: 'Wholesaler Profiles',
    icon: 'IconUser',
    type: 'RELATION',
    relationTargetObjectMetadataId: wholesaler.id,
    relationTargetFieldMetadataId: 'wholesaler-workspaceMember-field-id',
    settings: { relationType: 'ONE_TO_MANY' },
  });
};

test('projects State and ZIP from the native address for every company', () => {
  const plan = buildTerritoryProjectionPlan(
    [
      {
        id: 'company-1',
        updatedAt: '2026-09-08T00:00:00.000Z',
        address: {
          addressState: ' IL ',
          addressPostcode: '60601 ',
          addressCountry: 'US',
        },
        stateRegion: null,
        postalCode: null,
      },
      {
        id: 'company-2',
        updatedAt: '2026-09-08T00:00:00.000Z',
        address: {
          addressState: 'Ontario',
          addressPostcode: 'M5V 3A8',
          addressCountry: 'CA',
        },
        stateRegion: 'Ontario',
        postalCode: 'M5V 3A8',
      },
    ],
    2,
  );

  assert.deepEqual(plan.mutations, [
    {
      id: 'company-1',
      expectedUpdatedAt: '2026-09-08T00:00:00.000Z',
      data: { stateRegion: 'IL', postalCode: '60601' },
    },
  ]);
  assert.match(plan.companyIdentityHash, /^[a-f0-9]{64}$/);
  assert.match(plan.sourceProjectionHash, /^[a-f0-9]{64}$/);
  assert.match(plan.expectedProjectionHash, /^[a-f0-9]{64}$/);
});

test('assigns Grace and Kelly to Chicago and Nash to Florida deterministically', () => {
  const graceWorkspaceMemberId = '11111111-1111-4111-8111-111111111111';
  const kellyWorkspaceMemberId = '22222222-2222-4222-8222-222222222222';
  const nashWorkspaceMemberId = '33333333-3333-4333-8333-333333333333';
  const wholesalers = [
    {
      id: 'grace-id',
      updatedAt: '2026-09-08T00:00:00.000Z',
      name: 'Names are not identity',
      workspaceMember: { id: graceWorkspaceMemberId },
      territory: null,
    },
    {
      id: 'kelly-id',
      updatedAt: '2026-09-08T00:00:00.000Z',
      name: 'Grace Nash',
      workspaceMember: { id: kellyWorkspaceMemberId },
      territory: '  Chicago  ',
    },
    {
      id: 'nash-id',
      updatedAt: '2026-09-08T00:00:00.000Z',
      name: 'Kelly Grace',
      workspaceMember: { id: nashWorkspaceMemberId },
      territory: 'Midwest',
    },
    {
      id: 'other-id',
      updatedAt: '2026-09-08T00:00:00.000Z',
      name: 'Taylor Smith',
      workspaceMember: {
        id: '44444444-4444-4444-8444-444444444444',
      },
      territory: 'West',
    },
  ];

  const plan = buildWholesalerTerritoryPlan(wholesalers, [
    { workspaceMemberId: graceWorkspaceMemberId, territory: 'Chicago' },
    { workspaceMemberId: kellyWorkspaceMemberId, territory: 'Chicago' },
    { workspaceMemberId: nashWorkspaceMemberId, territory: 'Florida' },
  ]);

  assert.deepEqual(plan.mutations, [
    {
      id: 'grace-id',
      expectedUpdatedAt: '2026-09-08T00:00:00.000Z',
      data: { territory: 'Chicago' },
    },
    {
      id: 'nash-id',
      expectedUpdatedAt: '2026-09-08T00:00:00.000Z',
      data: { territory: 'Florida' },
    },
  ]);
  assert.equal(plan.wholesalerCount, 4);
  assert.match(plan.wholesalerIdentityHash, /^[a-f0-9]{64}$/);
  assert.match(plan.expectedTerritoryHash, /^[a-f0-9]{64}$/);
});

test('builds approved territory assignments only from distinct immutable member IDs', () => {
  assert.deepEqual(
    buildApprovedWholesalerTerritoryAssignments({
      graceWorkspaceMemberId: '11111111-1111-4111-8111-111111111111',
      kellyWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
      nashWorkspaceMemberId: '33333333-3333-4333-8333-333333333333',
    }),
    [
      {
        workspaceMemberId: '11111111-1111-4111-8111-111111111111',
        territory: 'Chicago',
      },
      {
        workspaceMemberId: '22222222-2222-4222-8222-222222222222',
        territory: 'Chicago',
      },
      {
        workspaceMemberId: '33333333-3333-4333-8333-333333333333',
        territory: 'Florida',
      },
    ],
  );
  assert.throws(
    () =>
      buildApprovedWholesalerTerritoryAssignments({
        graceWorkspaceMemberId: 'not-a-uuid',
        kellyWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
        nashWorkspaceMemberId: '33333333-3333-4333-8333-333333333333',
      }),
    /identities are invalid/i,
  );
});

test('fails closed when immutable territory identities are missing, ambiguous, or reused', () => {
  const graceWorkspaceMemberId = '11111111-1111-4111-8111-111111111111';
  const kellyWorkspaceMemberId = '22222222-2222-4222-8222-222222222222';
  const nashWorkspaceMemberId = '33333333-3333-4333-8333-333333333333';
  const assignments = [
    { workspaceMemberId: graceWorkspaceMemberId, territory: 'Chicago' },
    { workspaceMemberId: kellyWorkspaceMemberId, territory: 'Chicago' },
    { workspaceMemberId: nashWorkspaceMemberId, territory: 'Florida' },
  ];
  const record = (id: string, workspaceMemberId: string) => ({
    id,
    name: 'Mutable display name',
    updatedAt: '2026-09-08T00:00:00.000Z',
    workspaceMember: { id: workspaceMemberId },
  });

  assert.throws(
    () =>
      buildWholesalerTerritoryPlan(
        [
          record('kelly', kellyWorkspaceMemberId),
          record('nash', nashWorkspaceMemberId),
        ],
        assignments,
      ),
    /exactly one/i,
  );
  assert.throws(
    () =>
      buildWholesalerTerritoryPlan(
        [
          record('grace-1', graceWorkspaceMemberId),
          record('grace-2', graceWorkspaceMemberId),
          record('kelly', kellyWorkspaceMemberId),
          record('nash', nashWorkspaceMemberId),
        ],
        assignments,
      ),
    /linked workspace member/i,
  );
  assert.throws(
    () =>
      buildWholesalerTerritoryPlan(
        [
          record('grace', graceWorkspaceMemberId),
          record('kelly', kellyWorkspaceMemberId),
          record('nash', nashWorkspaceMemberId),
        ],
        [assignments[0]!, assignments[0]!, assignments[2]!],
      ),
    /assignment identities/i,
  );
});

test('fails before mutation when company coverage is not exact', () => {
  assert.throws(
    () =>
      buildTerritoryProjectionPlan(
        [
          {
            id: 'company-1',
            updatedAt: '2026-09-08T00:00:00.000Z',
            address: {},
          },
        ],
        2,
      ),
    /company count/i,
  );
});

test('bootstraps territory fields before planning the exact sales layout', () => {
  const firstPlan = buildWorkspaceConfigPlan(snapshot());

  assert.deepEqual(
    firstPlan.metadataFieldsToCreate.map(({ name, label, type }) => ({
      name,
      label,
      type,
    })),
    [
      { name: 'stateRegion', label: 'State', type: 'TEXT' },
      { name: 'postalCode', label: 'ZIP Code', type: 'TEXT' },
      {
        name: 'territory',
        label: 'Territory',
        type: 'TEXT',
      },
      {
        name: 'workspaceMember',
        label: 'Workspace Member',
        type: 'RELATION',
      },
    ],
  );
  assert.equal(firstPlan.layout, null);
});

test('converges navigation, Follow-ups, company fields, and state sorting', () => {
  const value = snapshot();
  const company = value.objects[0]!;
  company.fields.push(
    {
      id: 'company-stateRegion-field-id',
      name: 'stateRegion',
      label: 'State',
      type: 'TEXT',
    },
    {
      id: 'company-postalCode-field-id',
      name: 'postalCode',
      label: 'ZIP Code',
      type: 'TEXT',
    },
  );
  addWorkspaceMemberRelation(value);

  const plan = buildWorkspaceConfigPlan(value);
  assert.ok(plan.layout);
  assert.deepEqual(plan.layout.visibleCompanyFieldNames, [
    'name',
    'historicalOwner',
    'stateRegion',
    'postalCode',
    'address',
    'firmPhone',
    'linkedinLink',
    'leadStatus',
  ]);
  assert.deepEqual(plan.layout.visiblePersonFieldNames, [
    'name',
    'company',
    'jobTitle',
    'emails',
    'phones',
    'city',
    'stateRegion',
    'linkedinLink',
    'notes',
  ]);
  assert.ok(
    plan.layout.viewFieldUpdates.some(
      ({ id, update }) => id === 'person-view-field-7' && !update.isVisible,
    ),
  );
  assert.ok(
    plan.layout.viewFieldUpdates.some(
      ({ id, update }) =>
        id === 'person-view-field-1' &&
        update.position === 1 &&
        update.size === 210,
    ),
  );
  assert.deepEqual(plan.layout.viewSortsToCreate, [
    {
      id: 'c0671000-0000-4000-8000-000000000004',
      fieldMetadataId: 'company-address-field-id',
      viewId: 'company-index-view-id',
      direction: 'ASC',
      subFieldName: ADDRESS_STATE_SUBFIELD,
    },
    {
      id: 'c0671000-0000-4000-8000-000000000005',
      fieldMetadataId: 'outreachActivity-followUpDate-field-id',
      viewId: 'c0671000-0000-4000-8000-000000000001',
      direction: 'ASC',
    },
  ]);
  assert.deepEqual(
    plan.layout.navigationItemsToCreate.map(({ type, position }) => ({
      type,
      position,
    })),
    [
      { type: 'OBJECT', position: 2 },
      { type: 'OBJECT', position: 3 },
      { type: 'VIEW', position: 4 },
    ],
  );
  assert.deepEqual(plan.layout.navigationItemIdsToDelete.sort(), [
    'import-batches-nav-id',
    'tasks-nav-id',
  ]);
  assert.deepEqual(plan.layout.viewUpdates, []);
  assert.deepEqual(plan.layout.viewsToCreate, [
    {
      id: 'c0671000-0000-4000-8000-000000000001',
      universalIdentifier: 'c0671000-0000-4000-8000-000000000006',
      name: 'Follow-ups',
      objectMetadataId: 'outreachActivity-object-id',
      type: 'TABLE',
      icon: 'IconChecklist',
      position: 2,
      visibility: 'WORKSPACE',
    },
  ]);
  assert.deepEqual(plan.layout.viewFiltersToCreate, [
    {
      id: 'c0671000-0000-4000-8000-000000000002',
      fieldMetadataId: 'outreachActivity-followUpDate-field-id',
      viewId: 'c0671000-0000-4000-8000-000000000001',
      operand: 'IS_NOT_EMPTY',
      value: '',
    },
  ]);
  assert.deepEqual(
    plan.layout.viewFieldsToCreate
      .filter(({ viewId }) => viewId === 'c0671000-0000-4000-8000-000000000001')
      .map(({ fieldMetadataId, position }) => ({ fieldMetadataId, position })),
    [
      { fieldMetadataId: 'outreachActivity-company-field-id', position: 0 },
      { fieldMetadataId: 'outreachActivity-contact-field-id', position: 1 },
      { fieldMetadataId: 'outreachActivity-wholesaler-field-id', position: 2 },
      { fieldMetadataId: 'outreachActivity-outcome-field-id', position: 3 },
      {
        fieldMetadataId: 'outreachActivity-followUpDate-field-id',
        position: 4,
      },
      { fieldMetadataId: 'outreachActivity-occurredAt-field-id', position: 5 },
      { fieldMetadataId: 'outreachActivity-notes-field-id', position: 6 },
    ],
  );
});

test('never adopts or rewrites user-owned Follow-ups views', () => {
  const incompatible = snapshot();
  incompatible.objects[0]!.fields.push({
    id: 'bad-state-id',
    name: 'stateRegion',
    label: 'State',
    type: 'NUMBER',
  });
  assert.throws(
    () => buildWorkspaceConfigPlan(incompatible),
    /stateRegion.*TEXT/i,
  );

  const ambiguousFollowUps = snapshot();
  ambiguousFollowUps.objects[0]!.fields.push(
    {
      id: 'company-stateRegion-field-id',
      name: 'stateRegion',
      label: 'State',
      type: 'TEXT',
    },
    {
      id: 'company-postalCode-field-id',
      name: 'postalCode',
      label: 'ZIP Code',
      type: 'TEXT',
    },
  );
  addWorkspaceMemberRelation(ambiguousFollowUps);
  const outreachActivity = ambiguousFollowUps.objects[6]!;
  const emptyView = (id: string) => ({
    id,
    universalIdentifier: `${id}-universal`,
    name: 'Follow-ups',
    objectMetadataId: outreachActivity.id,
    type: 'TABLE',
    key: null,
    icon: 'IconChecklist',
    position: 2,
    visibility: 'WORKSPACE',
    createdByUserWorkspaceId: null,
    viewFields: [],
    viewFilters: [],
    viewSorts: [],
  });
  ambiguousFollowUps.views.push(
    emptyView('follow-up-a'),
    emptyView('follow-up-b'),
  );
  const namedPlan = buildWorkspaceConfigPlan(ambiguousFollowUps);
  assert.ok(namedPlan.layout);
  assert.equal(namedPlan.layout.viewsToCreate.length, 1);
  assert.deepEqual(namedPlan.layout.viewUpdates, []);

  const managedIdUserView = structuredClone(ambiguousFollowUps);
  managedIdUserView.views[2] = {
    ...emptyView('c0671000-0000-4000-8000-000000000001'),
    universalIdentifier: 'c0671000-0000-4000-8000-000000000006',
    createdByUserWorkspaceId: 'another-user-workspace-id',
  };
  assert.throws(
    () => buildWorkspaceConfigPlan(managedIdUserView),
    /workspace-owned/i,
  );

  const wrongUniversalIdentifier = structuredClone(managedIdUserView);
  wrongUniversalIdentifier.views[2]!.createdByUserWorkspaceId = null;
  wrongUniversalIdentifier.views[2]!.universalIdentifier =
    '99999999-9999-4999-8999-999999999999';
  assert.throws(
    () => buildWorkspaceConfigPlan(wrongUniversalIdentifier),
    /managed.*identity/i,
  );

  const privateManagedView = structuredClone(managedIdUserView);
  privateManagedView.views[2]!.createdByUserWorkspaceId = null;
  privateManagedView.views[2]!.visibility = 'UNLISTED';
  assert.throws(
    () => buildWorkspaceConfigPlan(privateManagedView),
    /workspace table/i,
  );
});

test('requires the exact quick-log scalar field types before planning mutations', () => {
  for (const [fieldName, expectedType] of [
    ['activityType', 'TEXT'],
    ['outcome', 'TEXT'],
    ['notes', 'TEXT'],
    ['occurredAt', 'DATE_TIME'],
    ['followUpDate', 'DATE'],
  ] as const) {
    const value = snapshot();
    const field = value.objects[6]!.fields.find(
      ({ name }) => name === fieldName,
    )!;
    field.type = 'INCOMPATIBLE';

    assert.throws(
      () => buildWorkspaceConfigPlan(value),
      new RegExp(`${fieldName}.*${expectedType}`, 'i'),
    );
  }

  const missingActivityType = snapshot();
  missingActivityType.objects[6]!.fields =
    missingActivityType.objects[6]!.fields.filter(
      ({ name }) => name !== 'activityType',
    );
  const bootstrapPlan = buildWorkspaceConfigPlan(missingActivityType);
  assert.deepEqual(
    bootstrapPlan.metadataFieldsToCreate.find(
      ({ name }) => name === 'activityType',
    ),
    {
      objectMetadataId: 'outreachActivity-object-id',
      name: 'activityType',
      label: 'Activity Type',
      type: 'TEXT',
    },
  );
  assert.equal(bootstrapPlan.layout, null);
});

test('requires exact quick-log MANY_TO_ONE relation targets and cardinality', () => {
  for (const [fieldName, targetObjectName] of [
    ['company', 'company'],
    ['contact', 'person'],
    ['wholesaler', 'wholesaler'],
  ] as const) {
    const wrongTarget = snapshot();
    const wrongTargetField = wrongTarget.objects[6]!.fields.find(
      ({ name }) => name === fieldName,
    )!;
    wrongTargetField.relationTargetObjectMetadataId =
      'workspaceMember-object-id';
    assert.throws(
      () => buildWorkspaceConfigPlan(wrongTarget),
      new RegExp(`${fieldName}.*MANY_TO_ONE.*${targetObjectName}`, 'i'),
    );

    const wrongCardinality = snapshot();
    const wrongCardinalityField = wrongCardinality.objects[6]!.fields.find(
      ({ name }) => name === fieldName,
    )!;
    wrongCardinalityField.settings = { relationType: 'ONE_TO_MANY' };
    assert.throws(
      () => buildWorkspaceConfigPlan(wrongCardinality),
      new RegExp(`${fieldName}.*MANY_TO_ONE.*${targetObjectName}`, 'i'),
    );
  }
});

test('converges historicalOwner label without renaming its compatible field', () => {
  const value = snapshot();
  const historicalOwner = value.objects[0]!.fields.find(
    ({ name }) => name === 'historicalOwner',
  )!;

  const plan = buildWorkspaceConfigPlan(value);
  assert.deepEqual(
    plan.metadataFieldsToUpdate.find(({ id }) => id === historicalOwner.id),
    { id: historicalOwner.id, label: 'Wholesaler' },
  );
  assert.equal(historicalOwner.name, 'historicalOwner');

  historicalOwner.label = 'Wholesaler';
  const convergedPlan = buildWorkspaceConfigPlan(value);
  assert.equal(
    convergedPlan.metadataFieldsToUpdate.some(
      ({ id }) => id === historicalOwner.id,
    ),
    false,
  );
});

test('rejects an incompatible historicalOwner relation before planning mutations', () => {
  for (const mutate of [
    (value: WorkspaceConfigSnapshot) => {
      value.objects[0]!.fields.find(
        ({ name }) => name === 'historicalOwner',
      )!.type = 'TEXT';
    },
    (value: WorkspaceConfigSnapshot) => {
      value.objects[0]!.fields.find(
        ({ name }) => name === 'historicalOwner',
      )!.relationTargetObjectMetadataId = 'person-object-id';
    },
    (value: WorkspaceConfigSnapshot) => {
      value.objects[0]!.fields.find(
        ({ name }) => name === 'historicalOwner',
      )!.settings = { relationType: 'ONE_TO_MANY' };
    },
  ]) {
    const value = snapshot();
    mutate(value);
    assert.throws(
      () => buildWorkspaceConfigPlan(value),
      /historicalOwner.*MANY_TO_ONE.*wholesaler/i,
    );
  }
});

test('converges company and Follow-ups column widths', () => {
  const value = snapshot();
  value.objects[0]!.fields.push(
    {
      id: 'company-stateRegion-field-id',
      name: 'stateRegion',
      label: 'State',
      type: 'TEXT',
    },
    {
      id: 'company-postalCode-field-id',
      name: 'postalCode',
      label: 'ZIP Code',
      type: 'TEXT',
    },
  );
  addWorkspaceMemberRelation(value);
  const outreachActivity = value.objects[6]!;
  value.views.push({
    id: 'c0671000-0000-4000-8000-000000000001',
    universalIdentifier: 'c0671000-0000-4000-8000-000000000006',
    name: 'Follow-ups',
    objectMetadataId: outreachActivity.id,
    type: 'TABLE',
    key: null,
    icon: 'IconChecklist',
    position: 8,
    visibility: 'WORKSPACE',
    createdByUserWorkspaceId: null,
    viewFields: outreachActivity.fields.map((field, position) => ({
      id: `existing-follow-up-field-${position}`,
      fieldMetadataId: field.id,
      isVisible: true,
      position,
      size: 99,
    })),
    viewFilters: [],
    viewSorts: [],
  });

  const plan = buildWorkspaceConfigPlan(value);
  assert.ok(plan.layout);
  assert.deepEqual(plan.layout.viewUpdates, [
    {
      id: 'c0671000-0000-4000-8000-000000000001',
      update: { position: 2 },
    },
  ]);
  assert.deepEqual(
    plan.layout.viewFieldUpdates
      .filter(
        ({ id, update }) =>
          id.startsWith('existing-follow-up-field-') &&
          update.size !== undefined,
      )
      .map(({ id, update }) => ({ id, size: update.size })),
    outreachActivity.fields
      .filter((field) =>
        [
          'company',
          'contact',
          'wholesaler',
          'outcome',
          'followUpDate',
          'occurredAt',
          'notes',
        ].includes(field.name),
      )
      .map((field) => ({
        id: `existing-follow-up-field-${outreachActivity.fields.indexOf(field)}`,
        size:
          field.name === 'company' ? 210 : field.name === 'notes' ? 250 : 150,
      })),
  );
  assert.ok(
    plan.layout.viewFieldUpdates.some(
      ({ id, update }) => id === 'company-view-field-2' && update.size === 250,
    ),
  );
});

test('creates the wholesaler workspace member relation with the exact contract', () => {
  const plan = buildWorkspaceConfigPlan(snapshot());
  const relation = plan.metadataFieldsToCreate.find(
    ({ name }) => name === 'workspaceMember',
  );

  assert.deepEqual(relation, {
    objectMetadataId: 'wholesaler-object-id',
    name: 'workspaceMember',
    label: 'Workspace Member',
    type: 'RELATION',
    relationCreationPayload: {
      targetObjectMetadataId: 'workspaceMember-object-id',
      targetFieldLabel: 'Wholesaler Profiles',
      targetFieldIcon: 'IconUser',
      type: 'MANY_TO_ONE',
    },
  });
});

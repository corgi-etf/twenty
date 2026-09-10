import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  APPLY_WORKSPACE_CONFIG_CONFIRMATION,
  BOOTSTRAP_WORKSPACE_METADATA_CONFIRMATION,
  runWorkspaceMetadataBootstrap,
  runWorkspaceConfiguration,
  type WorkspaceConfigApi,
  type WorkspaceConfigCheckpoint,
  type WorkspaceMetadataBootstrapApi,
} from '../src/execution.ts';
import {
  buildApprovedWholesalerTerritoryAssignments,
  MANAGED_FOLLOW_UP_VIEW_ID,
  MANAGED_FOLLOW_UP_VIEW_UNIVERSAL_IDENTIFIER,
  type CompanyTerritoryRecord,
  type WholesalerTerritoryRecord,
  type WorkspaceConfigSnapshot,
} from '../src/planner.ts';

const graceWorkspaceMemberId = '11111111-1111-4111-8111-111111111111';
const nashWorkspaceMemberId = '33333333-3333-4333-8333-333333333333';
const wholesalerTerritoryAssignments =
  buildApprovedWholesalerTerritoryAssignments({
    graceWorkspaceMemberId,
    nashWorkspaceMemberId,
  });

const fixture = (): WorkspaceConfigSnapshot => {
  const field = (objectName: string, name: string, type: string) => ({
    id: `${objectName}-${name}-field-id`,
    name,
    label:
      name === 'stateRegion'
        ? 'State'
        : name === 'postalCode'
          ? 'ZIP Code'
          : name === 'territory'
            ? 'Territory'
            : name === 'workspaceMember'
              ? 'Workspace Member'
              : name === 'historicalOwner'
                ? 'Wholesaler'
                : name === 'activityType'
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
  });
  const companyFields = [
    field('company', 'name', 'FULL_NAME'),
    {
      ...field('company', 'historicalOwner', 'RELATION'),
      relationTargetObjectMetadataId: 'wholesaler-object-id',
      settings: { relationType: 'MANY_TO_ONE' },
    },
    field('company', 'stateRegion', 'TEXT'),
    field('company', 'postalCode', 'TEXT'),
    field('company', 'address', 'ADDRESS'),
    field('company', 'firmPhone', 'TEXT'),
    field('company', 'linkedinLink', 'LINKS'),
    field('company', 'leadStatus', 'TEXT'),
    field('company', 'updatedAt', 'DATE_TIME'),
  ];
  const taskFields = [
    field('task', 'title', 'TEXT'),
    field('task', 'status', 'SELECT'),
    field('task', 'taskTargets', 'RELATION'),
    field('task', 'dueAt', 'DATE_TIME'),
    field('task', 'assignee', 'RELATION'),
    field('task', 'bodyV2', 'RICH_TEXT_V2'),
  ];
  const personFields = [
    field('person', 'name', 'FULL_NAME'),
    field('person', 'company', 'RELATION'),
    field('person', 'jobTitle', 'TEXT'),
    field('person', 'emails', 'EMAILS'),
    field('person', 'phones', 'PHONES'),
    field('person', 'city', 'TEXT'),
    field('person', 'stateRegion', 'TEXT'),
    field('person', 'linkedinLink', 'LINKS'),
    field('person', 'notes', 'TEXT'),
  ];
  const outreachFields = [
    {
      ...field('outreachActivity', 'company', 'RELATION'),
      relationTargetObjectMetadataId: 'company-object-id',
      settings: { relationType: 'MANY_TO_ONE' },
    },
    {
      ...field('outreachActivity', 'contact', 'RELATION'),
      relationTargetObjectMetadataId: 'person-object-id',
      settings: { relationType: 'MANY_TO_ONE' },
    },
    {
      ...field('outreachActivity', 'wholesaler', 'RELATION'),
      relationTargetObjectMetadataId: 'wholesaler-object-id',
      settings: { relationType: 'MANY_TO_ONE' },
    },
    field('outreachActivity', 'outcome', 'TEXT'),
    field('outreachActivity', 'followUpDate', 'DATE'),
    field('outreachActivity', 'occurredAt', 'DATE_TIME'),
    field('outreachActivity', 'notes', 'TEXT'),
    field('outreachActivity', 'activityType', 'TEXT'),
  ];
  const objects = [
    {
      id: 'company-object-id',
      nameSingular: 'company',
      namePlural: 'companies',
      fields: companyFields,
    },
    {
      id: 'person-object-id',
      nameSingular: 'person',
      namePlural: 'people',
      fields: personFields,
    },
    {
      id: 'wholesaler-object-id',
      nameSingular: 'wholesaler',
      namePlural: 'wholesalers',
      fields: [
        field('wholesaler', 'territory', 'TEXT'),
        {
          ...field('wholesaler', 'workspaceMember', 'RELATION'),
          relationTargetObjectMetadataId: 'workspaceMember-object-id',
          relationTargetFieldMetadataId:
            'workspaceMember-wholesalerProfiles-field-id',
          settings: { relationType: 'MANY_TO_ONE' },
        },
      ],
    },
    {
      id: 'salesTeam-object-id',
      nameSingular: 'salesTeam',
      namePlural: 'salesTeams',
      fields: [],
    },
    {
      id: 'teamMembership-object-id',
      nameSingular: 'teamMembership',
      namePlural: 'teamMemberships',
      fields: [],
    },
    {
      id: 'task-object-id',
      nameSingular: 'task',
      namePlural: 'tasks',
      fields: taskFields,
    },
    {
      id: 'outreachActivity-object-id',
      nameSingular: 'outreachActivity',
      namePlural: 'outreachActivities',
      fields: outreachFields,
    },
    {
      id: 'workspaceMember-object-id',
      nameSingular: 'workspaceMember',
      namePlural: 'workspaceMembers',
      fields: [
        {
          id: 'workspaceMember-wholesalerProfiles-field-id',
          name: 'wholesalerProfiles',
          label: 'Wholesaler Profiles',
          icon: 'IconUser',
          type: 'RELATION',
          relationTargetObjectMetadataId: 'wholesaler-object-id',
          relationTargetFieldMetadataId: 'wholesaler-workspaceMember-field-id',
          settings: { relationType: 'ONE_TO_MANY' },
        },
      ],
    },
  ];
  const companyViewId = 'company-index-view-id';
  const followUpViewId = MANAGED_FOLLOW_UP_VIEW_ID;

  return {
    objects,
    views: [
      {
        id: companyViewId,
        universalIdentifier: 'company-index-universal-id',
        name: 'All Companies',
        objectMetadataId: objects[0]!.id,
        type: 'TABLE',
        key: 'INDEX',
        icon: 'IconTable',
        position: 0,
        visibility: 'WORKSPACE',
        createdByUserWorkspaceId: null,
        viewFields: companyFields.map((metadataField, position) => ({
          id: `company-view-field-${position}`,
          fieldMetadataId: metadataField.id,
          isVisible: position < 8,
          position,
          size: metadataField.name === 'address' ? 250 : 150,
        })),
        viewFilters: [],
        viewSorts: [
          {
            id: 'state-sort-id',
            fieldMetadataId: companyFields[4]!.id,
            direction: 'ASC',
            subFieldName: 'addressState',
          },
        ],
      },
      {
        id: 'person-index-view-id',
        universalIdentifier: 'person-index-universal-id',
        name: 'All People',
        objectMetadataId: objects[1]!.id,
        type: 'TABLE',
        key: 'INDEX',
        icon: 'IconTable',
        position: 1,
        visibility: 'WORKSPACE',
        createdByUserWorkspaceId: null,
        viewFields: personFields.map((metadataField, position) => ({
          id: `person-view-field-${position}`,
          fieldMetadataId: metadataField.id,
          isVisible: true,
          position,
          size:
            metadataField.name === 'company'
              ? 210
              : metadataField.name === 'emails' ||
                  metadataField.name === 'notes'
                ? 220
                : 150,
        })),
        viewFilters: [],
        viewSorts: [],
      },
      {
        id: followUpViewId,
        universalIdentifier: MANAGED_FOLLOW_UP_VIEW_UNIVERSAL_IDENTIFIER,
        name: 'Follow-ups',
        objectMetadataId: objects[6]!.id,
        type: 'TABLE',
        key: null,
        icon: 'IconChecklist',
        position: 2,
        visibility: 'WORKSPACE',
        createdByUserWorkspaceId: null,
        viewFields: outreachFields
          .filter(({ name }) => name !== 'activityType')
          .map((metadataField, position) => ({
            id: `outreach-view-field-${position}`,
            fieldMetadataId: metadataField.id,
            isVisible: true,
            position,
            size:
              metadataField.name === 'company'
                ? 210
                : metadataField.name === 'notes'
                  ? 250
                  : 150,
          })),
        viewFilters: [
          {
            id: 'follow-up-date-filter-id',
            fieldMetadataId: outreachFields[4]!.id,
            operand: 'IS_NOT_EMPTY',
            value: '',
          },
        ],
        viewSorts: [
          {
            id: 'follow-up-date-sort-id',
            fieldMetadataId: outreachFields[4]!.id,
            direction: 'ASC',
            subFieldName: null,
          },
        ],
      },
    ],
    navigationMenuItems: [
      ...objects.slice(0, 4).map((metadataObject, position) => ({
        id: `${metadataObject.nameSingular}-nav-id`,
        type: 'OBJECT',
        userWorkspaceId: null,
        targetObjectMetadataId: metadataObject.id,
        viewId: null,
        folderId: null,
        position,
      })),
      {
        id: 'follow-up-nav-id',
        type: 'VIEW',
        userWorkspaceId: null,
        targetObjectMetadataId: null,
        viewId: followUpViewId,
        folderId: null,
        position: 4,
      },
    ],
  };
};

class FakeApi implements WorkspaceConfigApi {
  snapshot = fixture();
  companies: CompanyTerritoryRecord[] = [
    {
      id: 'company-1',
      updatedAt: '2026-09-08T00:00:00.000Z',
      address: { addressState: 'IL', addressPostcode: '60601' },
      stateRegion: null,
      postalCode: null,
    },
  ];
  wholesalers: WholesalerTerritoryRecord[] = [
    {
      id: 'grace-id',
      name: 'Grace Hopper',
      workspaceMember: { id: graceWorkspaceMemberId },
      updatedAt: '2026-09-08T00:00:00.000Z',
      territory: null,
    },
    {
      id: 'nash-id',
      name: 'Morgan Nash',
      workspaceMember: { id: nashWorkspaceMemberId },
      updatedAt: '2026-09-08T00:00:00.000Z',
      territory: null,
    },
  ];
  checkpoint?: WorkspaceConfigCheckpoint;
  events: string[] = [];

  async listWorkspaceConfigSnapshot() {
    return structuredClone(this.snapshot);
  }

  async listCompanies() {
    return structuredClone(this.companies);
  }

  async listWholesalers() {
    return structuredClone(this.wholesalers);
  }

  async createMetadataField(): Promise<void> {
    this.events.push('metadata-create');
  }

  async updateMetadataFieldLabel(): Promise<void> {
    this.events.push('metadata-update');
  }

  async conditionalPatchCompany(id: string, _updatedAt: string, data: object) {
    this.events.push(`company:${id}`);
    Object.assign(this.companies.find((company) => company.id === id)!, data, {
      updatedAt: '2026-09-08T00:00:01.000Z',
    });
  }

  async conditionalPatchWholesaler(
    id: string,
    _updatedAt: string,
    data: object,
  ) {
    this.events.push(`territory:${id}`);
    Object.assign(
      this.wholesalers.find((wholesaler) => wholesaler.id === id)!,
      data,
      { updatedAt: '2026-09-08T00:00:01.000Z' },
    );
  }

  async createView(): Promise<void> {
    this.events.push('view-create');
  }

  async updateView(): Promise<void> {
    this.events.push('view-update');
  }

  async createViewField(): Promise<void> {
    this.events.push('view-field-create');
  }

  async updateViewField(): Promise<void> {
    this.events.push('view-field-update');
  }

  async createViewFilter(): Promise<void> {
    this.events.push('view-filter-create');
  }

  async deleteViewFilter(): Promise<void> {
    this.events.push('view-filter-delete');
  }

  async deleteViewSort(): Promise<void> {
    this.events.push('view-sort-delete');
  }

  async createViewSort(): Promise<void> {
    this.events.push('view-sort-create');
  }

  async deleteNavigationItems(): Promise<void> {
    this.events.push('navigation-delete');
  }

  async createNavigationItems(): Promise<void> {
    this.events.push('navigation-create');
  }

  async updateNavigationItems(): Promise<void> {
    this.events.push('navigation-update');
  }

  async readCheckpoint() {
    return structuredClone(this.checkpoint);
  }

  async writeCheckpoint(checkpoint: WorkspaceConfigCheckpoint) {
    this.checkpoint = structuredClone(checkpoint);
  }
}

test('backfills companies and seeded territories before layout and records a verified checkpoint', async () => {
  const api = new FakeApi();
  const result = await runWorkspaceConfiguration(api, {
    origin: 'https://crm.corgiinvest.com',
    expectedOrigin: 'https://crm.corgiinvest.com',
    expectedCompanyCount: 1,
    confirmation: APPLY_WORKSPACE_CONFIG_CONFIRMATION,
    wholesalerTerritoryAssignments,
  });

  assert.deepEqual(api.events, [
    'company:company-1',
    'territory:grace-id',
    'territory:nash-id',
  ]);
  assert.equal(result.companyMutations, 1);
  assert.equal(result.territoryMutations, 2);
  assert.equal(result.wholesalerCount, 2);
  assert.equal(result.layoutMutations, 0);
  assert.equal(api.checkpoint?.status, 'complete');
  assert.equal(api.checkpoint?.expectedCompanyCount, 1);
  assert.match(api.checkpoint?.expectedProjectionHash ?? '', /^[a-f0-9]{64}$/);
  assert.match(api.checkpoint?.expectedTerritoryHash ?? '', /^[a-f0-9]{64}$/);

  api.events = [];
  const rerun = await runWorkspaceConfiguration(api, {
    origin: 'https://crm.corgiinvest.com',
    expectedOrigin: 'https://crm.corgiinvest.com',
    expectedCompanyCount: 1,
    confirmation: APPLY_WORKSPACE_CONFIG_CONFIRMATION,
    wholesalerTerritoryAssignments,
  });
  assert.deepEqual(api.events, []);
  assert.equal(rerun.companyMutations, 0);
  assert.equal(rerun.territoryMutations, 0);
});

test('rejects an unapproved origin and confirmation before reading data', async () => {
  const api = new FakeApi();
  await assert.rejects(
    runWorkspaceConfiguration(api, {
      origin: 'https://example.com',
      expectedOrigin: 'https://crm.corgiinvest.com',
      expectedCompanyCount: 1,
      confirmation: APPLY_WORKSPACE_CONFIG_CONFIRMATION,
      wholesalerTerritoryAssignments,
    }),
    /origin/i,
  );
  await assert.rejects(
    runWorkspaceConfiguration(api, {
      origin: 'https://crm.corgiinvest.com',
      expectedOrigin: 'https://crm.corgiinvest.com',
      expectedCompanyCount: 1,
      confirmation: 'wrong',
      wholesalerTerritoryAssignments,
    }),
    /confirmation/i,
  );
  assert.deepEqual(api.events, []);
});

class BootstrapFakeApi implements WorkspaceMetadataBootstrapApi {
  snapshot = fixture();
  events: string[] = [];

  constructor() {
    for (const object of this.snapshot.objects) {
      if (object.nameSingular === 'company') {
        object.fields = object.fields.filter(
          ({ name }) => !['stateRegion', 'postalCode'].includes(name),
        );
      }
      if (object.nameSingular === 'wholesaler') object.fields = [];
      if (object.nameSingular === 'workspaceMember') object.fields = [];
      if (object.nameSingular === 'outreachActivity') object.fields = [];
    }
  }

  async listWorkspaceConfigSnapshot() {
    this.events.push('snapshot');

    return structuredClone(this.snapshot);
  }

  async createMetadataField(
    input: Parameters<WorkspaceMetadataBootstrapApi['createMetadataField']>[0],
  ): Promise<void> {
    this.events.push(`metadata-create:${input.name}`);
    const source = this.snapshot.objects.find(
      ({ id }) => id === input.objectMetadataId,
    )!;
    const sourceId = `${source.nameSingular}-${input.name}-bootstrap-id`;
    const inverseId = `${sourceId}-inverse`;
    source.fields.push({
      id: sourceId,
      name: input.name,
      label: input.label,
      type: input.type,
      ...(input.relationCreationPayload
        ? {
            relationTargetObjectMetadataId:
              input.relationCreationPayload.targetObjectMetadataId,
            relationTargetFieldMetadataId: inverseId,
            settings: { relationType: input.relationCreationPayload.type },
          }
        : {}),
    });
    if (input.relationCreationPayload) {
      const target = this.snapshot.objects.find(
        ({ id }) =>
          id === input.relationCreationPayload?.targetObjectMetadataId,
      )!;
      target.fields.push({
        id: inverseId,
        name: `${source.nameSingular}${input.name}Inverse`,
        label: input.relationCreationPayload.targetFieldLabel,
        icon: input.relationCreationPayload.targetFieldIcon,
        type: 'RELATION',
        relationTargetObjectMetadataId: source.id,
        relationTargetFieldMetadataId: sourceId,
        settings: { relationType: 'ONE_TO_MANY' },
      });
    }
  }

  async updateMetadataFieldLabel(id: string, label: string): Promise<void> {
    this.events.push(`metadata-update:${id}`);
    const field = this.snapshot.objects
      .flatMap(({ fields }) => fields)
      .find((candidate) => candidate.id === id)!;
    field.label = label;
  }
}

test('metadata bootstrap converges from no quick-log or member relation and is idempotent', async () => {
  const api = new BootstrapFakeApi();
  const options = {
    origin: 'https://crm.corgiinvest.com',
    expectedOrigin: 'https://crm.corgiinvest.com',
    confirmation: BOOTSTRAP_WORKSPACE_METADATA_CONFIRMATION,
  };

  const first = await runWorkspaceMetadataBootstrap(api, options);
  assert.equal(first.metadataMutations, 12);
  assert.match(first.metadataContractHash, /^[0-9a-f]{64}$/);
  assert.equal(api.events.filter((event) => event === 'snapshot').length, 2);
  assert.equal(
    api.events.filter((event) => event.startsWith('metadata-create:')).length,
    12,
  );
  assert.equal(
    api.snapshot.objects
      .find(({ nameSingular }) => nameSingular === 'wholesaler')!
      .fields.find(({ name }) => name === 'workspaceMember')?.settings
      ?.relationType,
    'MANY_TO_ONE',
  );

  api.events = [];
  const second = await runWorkspaceMetadataBootstrap(api, options);
  assert.equal(second.metadataMutations, 0);
  assert.deepEqual(api.events, ['snapshot', 'snapshot']);
});

test('metadata bootstrap rejects an unapproved gate before any API call', async () => {
  const api = new BootstrapFakeApi();
  await assert.rejects(
    runWorkspaceMetadataBootstrap(api, {
      origin: 'https://crm.corgiinvest.com',
      expectedOrigin: 'https://crm.corgiinvest.com',
      confirmation: 'wrong',
    }),
    /confirmation/i,
  );
  assert.deepEqual(api.events, []);
});

test('metadata bootstrap rejects an ambiguous inverse before any production mutation', async () => {
  const api = new BootstrapFakeApi();
  const wholesaler = api.snapshot.objects.find(
    ({ nameSingular }) => nameSingular === 'wholesaler',
  )!;
  const workspaceMember = api.snapshot.objects.find(
    ({ nameSingular }) => nameSingular === 'workspaceMember',
  )!;
  wholesaler.fields.push({
    id: 'wholesaler-workspaceMember-existing-id',
    name: 'workspaceMember',
    label: 'Workspace Member',
    type: 'RELATION',
    relationTargetObjectMetadataId: workspaceMember.id,
    settings: { relationType: 'MANY_TO_ONE' },
  });
  workspaceMember.fields.push(
    {
      id: 'workspaceMember-wholesalerProfiles-first-id',
      name: 'wholesalerProfiles',
      label: 'Wholesaler Profiles',
      icon: 'IconUser',
      type: 'RELATION',
      relationTargetObjectMetadataId: wholesaler.id,
      settings: { relationType: 'ONE_TO_MANY' },
    },
    {
      id: 'workspaceMember-wholesalerProfiles-second-id',
      name: 'otherWholesalerProfiles',
      label: 'Wholesaler Profiles',
      icon: 'IconUser',
      type: 'RELATION',
      relationTargetObjectMetadataId: wholesaler.id,
      settings: { relationType: 'ONE_TO_MANY' },
    },
  );

  await assert.rejects(
    runWorkspaceMetadataBootstrap(api, {
      origin: 'https://crm.corgiinvest.com',
      expectedOrigin: 'https://crm.corgiinvest.com',
      confirmation: BOOTSTRAP_WORKSPACE_METADATA_CONFIRMATION,
    }),
    /workspaceMember relation and inverse contract are incompatible/i,
  );
  assert.deepEqual(api.events, ['snapshot']);
});

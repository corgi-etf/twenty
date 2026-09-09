import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  APPLY_WORKSPACE_CONFIG_CONFIRMATION,
  runWorkspaceConfiguration,
  type WorkspaceConfigApi,
  type WorkspaceConfigCheckpoint,
} from '../src/execution.ts';
import type {
  CompanyTerritoryRecord,
  WorkspaceConfigSnapshot,
} from '../src/planner.ts';

const fixture = (): WorkspaceConfigSnapshot => {
  const field = (objectName: string, name: string, type: string) => ({
    id: `${objectName}-${name}-field-id`,
    name,
    label:
      name === 'stateRegion'
        ? 'State'
        : name === 'postalCode'
          ? 'ZIP Code'
          : name === 'workspaceMember'
            ? 'Workspace Member'
            : name === 'historicalOwner'
              ? 'Wholesaler'
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
      fields: [],
    },
    {
      id: 'wholesaler-object-id',
      nameSingular: 'wholesaler',
      namePlural: 'wholesalers',
      fields: [
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
  const followUpViewId = 'follow-up-view-id';

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
        id: followUpViewId,
        universalIdentifier: 'follow-up-universal-id',
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
  checkpoint?: WorkspaceConfigCheckpoint;
  events: string[] = [];

  async listWorkspaceConfigSnapshot() {
    return structuredClone(this.snapshot);
  }

  async listCompanies() {
    return structuredClone(this.companies);
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

test('backfills all companies before layout and records a verified checkpoint', async () => {
  const api = new FakeApi();
  const result = await runWorkspaceConfiguration(api, {
    origin: 'https://crm.corgiinvest.com',
    expectedOrigin: 'https://crm.corgiinvest.com',
    expectedCompanyCount: 1,
    confirmation: APPLY_WORKSPACE_CONFIG_CONFIRMATION,
  });

  assert.deepEqual(api.events, ['company:company-1']);
  assert.equal(result.companyMutations, 1);
  assert.equal(result.layoutMutations, 0);
  assert.equal(api.checkpoint?.status, 'complete');
  assert.equal(api.checkpoint?.expectedCompanyCount, 1);
  assert.match(api.checkpoint?.expectedProjectionHash ?? '', /^[a-f0-9]{64}$/);

  api.events = [];
  const rerun = await runWorkspaceConfiguration(api, {
    origin: 'https://crm.corgiinvest.com',
    expectedOrigin: 'https://crm.corgiinvest.com',
    expectedCompanyCount: 1,
    confirmation: APPLY_WORKSPACE_CONFIG_CONFIRMATION,
  });
  assert.deepEqual(api.events, []);
  assert.equal(rerun.companyMutations, 0);
});

test('rejects an unapproved origin and confirmation before reading data', async () => {
  const api = new FakeApi();
  await assert.rejects(
    runWorkspaceConfiguration(api, {
      origin: 'https://example.com',
      expectedOrigin: 'https://crm.corgiinvest.com',
      expectedCompanyCount: 1,
      confirmation: APPLY_WORKSPACE_CONFIG_CONFIRMATION,
    }),
    /origin/i,
  );
  await assert.rejects(
    runWorkspaceConfiguration(api, {
      origin: 'https://crm.corgiinvest.com',
      expectedOrigin: 'https://crm.corgiinvest.com',
      expectedCompanyCount: 1,
      confirmation: 'wrong',
    }),
    /confirmation/i,
  );
  assert.deepEqual(api.events, []);
});

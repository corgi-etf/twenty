import {
  MANAGED_FOLLOW_UP_VIEW_ID,
  MANAGED_FOLLOW_UP_VIEW_UNIVERSAL_IDENTIFIER,
  type WorkspaceConfigSnapshot,
} from '../src/planner.ts';
export const workspaceConfigFixture = (): WorkspaceConfigSnapshot => {
  const field = (objectName: string, name: string, type: string) => ({
    id: `${objectName}-${name}-field-id`,
    name,
    label:
      name === 'activeClient'
        ? 'Active client'
        : name === 'stateRegion'
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
                    ? 'Activity type'
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
    field('company', 'activeClient', 'BOOLEAN'),
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
    field('person', 'activeClient', 'BOOLEAN'),
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
    field('outreachActivity', 'activityType', 'SELECT'),
    field('outreachActivity', 'name', 'TEXT'),
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
      // Production reports a label identifier for every object. Omitting it
      // here hid a planner defect that stopped the whole rollout: the metadata
      // API refuses a view field for the label identifier.
      labelIdentifierFieldMetadataId: 'outreachActivity-name-field-id',
      fields: outreachFields,
    },
    {
      id: 'companyAllocation-object-id',
      nameSingular: 'companyAllocation',
      namePlural: 'companyAllocations',
      fields: [],
    },
    {
      id: 'workspaceMember-object-id',
      nameSingular: 'workspaceMember',
      namePlural: 'workspaceMembers',
      fields: [
        field('workspaceMember', 'accentPalette', 'TEXT'),
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

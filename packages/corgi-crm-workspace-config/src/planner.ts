import { createHash } from 'node:crypto';

export const ADDRESS_STATE_SUBFIELD = 'addressState';
export const MANAGED_FOLLOW_UP_VIEW_ID = 'c0671000-0000-4000-8000-000000000001';
export const MANAGED_FOLLOW_UP_VIEW_UNIVERSAL_IDENTIFIER =
  'c0671000-0000-4000-8000-000000000006';
export const MANAGED_FOLLOW_UP_FILTER_ID =
  'c0671000-0000-4000-8000-000000000002';
export const MANAGED_FOLLOW_UP_NAVIGATION_ID =
  'c0671000-0000-4000-8000-000000000003';
export const MANAGED_COMPANY_STATE_SORT_ID =
  'c0671000-0000-4000-8000-000000000004';
export const MANAGED_FOLLOW_UP_DATE_SORT_ID =
  'c0671000-0000-4000-8000-000000000005';

const MANAGED_FOLLOW_UP_VIEW_FIELD_IDS = [
  'c0671000-0000-4000-8000-000000000010',
  'c0671000-0000-4000-8000-000000000011',
  'c0671000-0000-4000-8000-000000000012',
  'c0671000-0000-4000-8000-000000000013',
  'c0671000-0000-4000-8000-000000000014',
  'c0671000-0000-4000-8000-000000000015',
  'c0671000-0000-4000-8000-000000000016',
] as const;

const TERRITORY_FIELD_DEFINITIONS = [
  { name: 'stateRegion', label: 'State', type: 'TEXT' },
  { name: 'postalCode', label: 'ZIP Code', type: 'TEXT' },
] as const;

export const WHOLESALER_TERRITORY_FIELD_DEFINITION = {
  name: 'territory',
  label: 'Territory',
  type: 'TEXT',
} as const;

export const VISIBLE_COMPANY_FIELD_NAMES = [
  'name',
  'historicalOwner',
  'stateRegion',
  'postalCode',
  'address',
  'firmPhone',
  'linkedinLink',
  'leadStatus',
] as const;

export const VISIBLE_PERSON_FIELD_NAMES = [
  'name',
  'company',
  'jobTitle',
  'emails',
  'phones',
  'city',
  'stateRegion',
  'linkedinLink',
  'notes',
] as const;

const REQUIRED_OBJECT_NAMES = [
  'company',
  'person',
  'wholesaler',
  'salesTeam',
  'teamMembership',
  'task',
  'outreachActivity',
  'workspaceMember',
] as const;

const FOLLOW_UP_VIEW_FIELD_NAMES = [
  'company',
  'contact',
  'wholesaler',
  'outcome',
  'followUpDate',
  'occurredAt',
  'notes',
] as const;

const QUICK_LOG_SCALAR_FIELD_DEFINITIONS = [
  { name: 'activityType', label: 'Activity Type', type: 'TEXT' },
  { name: 'outcome', label: 'Outcome', type: 'TEXT' },
  { name: 'notes', label: 'Notes', type: 'TEXT' },
  // Without a default, anything created without an explicit date lands NULL, and
  // every report filters on occurredAt -- so the activity exists but can never be
  // counted. 'now' serializes to Postgres now() at the field level, so UI, API and
  // import paths are all covered rather than each remembering to set it.
  {
    name: 'occurredAt',
    label: 'Occurred At',
    type: 'DATE_TIME',
    defaultValue: 'now',
  },
  { name: 'followUpDate', label: 'Follow-up Date', type: 'DATE' },
] as const;

const QUICK_LOG_RELATION_FIELD_DEFINITIONS = [
  {
    name: 'company',
    label: 'Company',
    targetObjectName: 'company',
    targetFieldLabel: 'Outreach Activities',
  },
  {
    name: 'contact',
    label: 'Contact',
    targetObjectName: 'person',
    targetFieldLabel: 'Outreach Activities',
  },
  {
    name: 'wholesaler',
    label: 'Wholesaler',
    targetObjectName: 'wholesaler',
    targetFieldLabel: 'Outreach Activities',
  },
] as const;

const companyViewFieldSize = (fieldName: string): number =>
  fieldName === 'address' ? 250 : 150;

const personViewFieldSize = (fieldName: string): number => {
  if (fieldName === 'company') return 210;
  if (fieldName === 'emails' || fieldName === 'notes') return 220;

  return 150;
};

const followUpViewFieldSize = (fieldName: string): number => {
  if (fieldName === 'company') return 210;
  if (fieldName === 'notes') return 250;

  return 150;
};

export type WorkspaceMetadataField = {
  id: string;
  name: string;
  label: string;
  type: string;
  icon?: string | null;
  relationTargetObjectMetadataId?: string | null;
  relationTargetFieldMetadataId?: string | null;
  settings?: {
    relationTargetObjectMetadataId?: string | null;
    relationType?: string | null;
  } | null;
};

export type WorkspaceMetadataObject = {
  id: string;
  nameSingular: string;
  namePlural: string;
  fields: WorkspaceMetadataField[];
};

export type WorkspaceViewField = {
  id: string;
  fieldMetadataId: string;
  isVisible: boolean;
  position: number;
  size: number;
};

export type WorkspaceViewFilter = {
  id: string;
  fieldMetadataId: string;
  operand: string;
  value: unknown;
  subFieldName?: string | null;
};

export type WorkspaceViewSort = {
  id: string;
  fieldMetadataId: string;
  direction: string;
  subFieldName?: string | null;
};

export type WorkspaceView = {
  id: string;
  universalIdentifier: string;
  name: string;
  objectMetadataId: string;
  type: string;
  key?: string | null;
  icon: string;
  position: number;
  visibility: string;
  createdByUserWorkspaceId?: string | null;
  viewFields: WorkspaceViewField[];
  viewFilters: WorkspaceViewFilter[];
  viewSorts: WorkspaceViewSort[];
};

export type WorkspaceNavigationMenuItem = {
  id: string;
  type: string;
  userWorkspaceId?: string | null;
  targetObjectMetadataId?: string | null;
  viewId?: string | null;
  folderId?: string | null;
  position: number;
  name?: string | null;
};

export type WorkspaceConfigSnapshot = {
  objects: WorkspaceMetadataObject[];
  views: WorkspaceView[];
  navigationMenuItems: WorkspaceNavigationMenuItem[];
};

export type CompanyTerritoryRecord = {
  id: string;
  updatedAt: string;
  address?: unknown;
  stateRegion?: unknown;
  postalCode?: unknown;
};

export type TerritoryProjectionMutation = {
  id: string;
  expectedUpdatedAt: string;
  data: { stateRegion: string | null; postalCode: string | null };
};

export type TerritoryProjectionPlan = {
  companyCount: number;
  companyIdentityHash: string;
  sourceProjectionHash: string;
  expectedProjectionHash: string;
  mutations: TerritoryProjectionMutation[];
};

export type WholesalerTerritoryRecord = {
  id: string;
  updatedAt: string;
  name?: unknown;
  territory?: unknown;
  workspaceMember?: { id?: unknown } | null;
};

export type WholesalerTerritoryAssignment = {
  workspaceMemberId: string;
  territory: string;
};

export type ApprovedWholesalerTerritoryIdentityInput = {
  graceWorkspaceMemberId: string;
  nashWorkspaceMemberId: string;
};

export type WholesalerTerritoryMutation = {
  id: string;
  expectedUpdatedAt: string;
  data: { territory: string };
};

export type WholesalerTerritoryPlan = {
  wholesalerCount: number;
  wholesalerIdentityHash: string;
  expectedTerritoryHash: string;
  mutations: WholesalerTerritoryMutation[];
};

export type MetadataFieldCreate = {
  objectMetadataId: string;
  name: string;
  label: string;
  type: string;
  relationCreationPayload?: {
    targetObjectMetadataId: string;
    targetFieldLabel: string;
    targetFieldIcon: string;
    type: 'MANY_TO_ONE';
  };
};

export type MetadataFieldUpdate = {
  id: string;
  label: string;
};

export type WorkspaceLayoutPlan = {
  visibleCompanyFieldNames: string[];
  visiblePersonFieldNames: string[];
  viewsToCreate: Array<{
    id: string;
    universalIdentifier: string;
    name: string;
    objectMetadataId: string;
    type: 'TABLE';
    icon: string;
    position: number;
    visibility: 'WORKSPACE';
  }>;
  viewUpdates: Array<{
    id: string;
    update: { name?: string; icon?: string; position?: number };
  }>;
  viewFieldsToCreate: Array<{
    id?: string;
    fieldMetadataId: string;
    viewId: string;
    isVisible: boolean;
    position: number;
    size: number;
  }>;
  viewFieldUpdates: Array<{
    id: string;
    update: { isVisible: boolean; position?: number; size?: number };
  }>;
  viewFiltersToCreate: Array<{
    id: string;
    fieldMetadataId: string;
    viewId: string;
    operand: 'IS_NOT_EMPTY';
    value: '';
  }>;
  viewFilterIdsToDelete: string[];
  viewSortIdsToDelete: string[];
  viewSortsToCreate: Array<{
    id?: string;
    fieldMetadataId: string;
    viewId: string;
    direction: 'ASC';
    subFieldName?: typeof ADDRESS_STATE_SUBFIELD;
  }>;
  navigationItemIdsToDelete: string[];
  navigationItemsToCreate: Array<{
    id?: string;
    type: 'OBJECT' | 'VIEW';
    targetObjectMetadataId?: string;
    viewId?: string;
    position: number;
  }>;
  navigationItemUpdates: Array<{
    id: string;
    update: { position: number; folderId: null };
  }>;
};

export type WorkspaceConfigPlan = {
  metadataFieldsToCreate: MetadataFieldCreate[];
  metadataFieldsToUpdate: MetadataFieldUpdate[];
  layout: WorkspaceLayoutPlan | null;
};

export type WorkspaceMetadataBootstrapPlan = Pick<
  WorkspaceConfigPlan,
  'metadataFieldsToCreate' | 'metadataFieldsToUpdate'
>;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const sha256 = (value: unknown): string =>
  createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');

const trimmedText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
};

const addressProjection = (
  address: unknown,
): { stateRegion: string | null; postalCode: string | null } => {
  if (address === null || address === undefined) {
    return { stateRegion: null, postalCode: null };
  }
  if (typeof address !== 'object' || Array.isArray(address)) {
    throw new Error('Company native address has an invalid shape');
  }
  const value = address as Record<string, unknown>;

  return {
    stateRegion: trimmedText(value.addressState),
    postalCode: trimmedText(value.addressPostcode),
  };
};

export const buildTerritoryProjectionPlan = (
  companies: CompanyTerritoryRecord[],
  expectedCompanyCount: number,
): TerritoryProjectionPlan => {
  if (
    !Number.isSafeInteger(expectedCompanyCount) ||
    expectedCompanyCount < 1 ||
    companies.length !== expectedCompanyCount
  ) {
    throw new Error('Territory projection company count does not match');
  }
  const ids = new Set<string>();
  const sourceRows: Array<Record<string, unknown>> = [];
  const expectedRows: Array<{
    id: string;
    stateRegion: string | null;
    postalCode: string | null;
  }> = [];
  const mutations: TerritoryProjectionMutation[] = [];

  for (const company of companies) {
    if (!company.id || ids.has(company.id)) {
      throw new Error('Territory projection company IDs are invalid');
    }
    ids.add(company.id);
    if (!company.updatedAt || Number.isNaN(Date.parse(company.updatedAt))) {
      throw new Error('Territory projection company timestamp is invalid');
    }
    const projected = addressProjection(company.address);
    const nativeAddress = company.address as Record<string, unknown> | null;
    sourceRows.push({
      id: company.id,
      addressState: nativeAddress?.addressState ?? null,
      addressPostcode: nativeAddress?.addressPostcode ?? null,
    });
    expectedRows.push({ id: company.id, ...projected });
    if (
      trimmedText(company.stateRegion) !== projected.stateRegion ||
      trimmedText(company.postalCode) !== projected.postalCode
    ) {
      mutations.push({
        id: company.id,
        expectedUpdatedAt: company.updatedAt,
        data: projected,
      });
    }
  }
  sourceRows.sort((left, right) =>
    String(left.id).localeCompare(String(right.id)),
  );
  expectedRows.sort((left, right) => left.id.localeCompare(right.id));

  return {
    companyCount: companies.length,
    companyIdentityHash: sha256([...ids].sort()),
    sourceProjectionHash: sha256(sourceRows),
    expectedProjectionHash: sha256(expectedRows),
    mutations,
  };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const buildApprovedWholesalerTerritoryAssignments = (
  input: ApprovedWholesalerTerritoryIdentityInput,
): WholesalerTerritoryAssignment[] => {
  const assignments = [
    {
      workspaceMemberId: input.graceWorkspaceMemberId,
      territory: 'Chicago',
    },
    {
      workspaceMemberId: input.nashWorkspaceMemberId,
      territory: 'Florida',
    },
  ];
  if (
    assignments.some(
      ({ workspaceMemberId }) => !UUID_PATTERN.test(workspaceMemberId),
    ) ||
    new Set(assignments.map(({ workspaceMemberId }) => workspaceMemberId))
      .size !== assignments.length
  ) {
    throw new Error(
      'Approved wholesaler territory workspace member identities are invalid',
    );
  }

  return assignments;
};

export const buildWholesalerTerritoryPlan = (
  wholesalers: WholesalerTerritoryRecord[],
  assignments: readonly WholesalerTerritoryAssignment[],
): WholesalerTerritoryPlan => {
  const ids = new Set<string>();
  const linkedWorkspaceMemberIds = new Set<string>();
  for (const wholesaler of wholesalers) {
    if (
      !wholesaler.id ||
      ids.has(wholesaler.id) ||
      !wholesaler.updatedAt ||
      Number.isNaN(Date.parse(wholesaler.updatedAt))
    ) {
      throw new Error('Wholesaler territory source records are invalid');
    }
    ids.add(wholesaler.id);
    const workspaceMember = wholesaler.workspaceMember;
    if (workspaceMember === undefined || workspaceMember === null) continue;
    if (typeof workspaceMember !== 'object' || Array.isArray(workspaceMember)) {
      throw new Error('Wholesaler linked workspace member shape is invalid');
    }
    const workspaceMemberId = workspaceMember.id;
    if (
      typeof workspaceMemberId !== 'string' ||
      !UUID_PATTERN.test(workspaceMemberId) ||
      linkedWorkspaceMemberIds.has(workspaceMemberId)
    ) {
      throw new Error(
        'Wholesaler linked workspace member identities are invalid or ambiguous',
      );
    }
    linkedWorkspaceMemberIds.add(workspaceMemberId);
  }

  if (
    assignments.length === 0 ||
    assignments.some(
      ({ workspaceMemberId, territory }) =>
        typeof workspaceMemberId !== 'string' ||
        !UUID_PATTERN.test(workspaceMemberId) ||
        typeof territory !== 'string' ||
        territory.length === 0 ||
        territory.trim() !== territory,
    ) ||
    new Set(assignments.map(({ workspaceMemberId }) => workspaceMemberId))
      .size !== assignments.length
  ) {
    throw new Error('Wholesaler territory assignment identities are invalid');
  }
  const seededTerritoryById = new Map<string, string>();
  for (const assignment of assignments) {
    const matches = wholesalers.filter(
      (wholesaler) =>
        wholesaler.workspaceMember?.id === assignment.workspaceMemberId,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Territory assignment for workspace member ${assignment.workspaceMemberId} must match exactly one wholesaler`,
      );
    }
    const [match] = matches;
    if (seededTerritoryById.has(match.id)) {
      throw new Error(
        'Territory assignments must resolve to distinct wholesalers',
      );
    }
    seededTerritoryById.set(match.id, assignment.territory);
  }

  const expectedRows = wholesalers
    .map((wholesaler) => ({
      id: wholesaler.id,
      workspaceMemberId: wholesaler.workspaceMember?.id ?? null,
      territory:
        seededTerritoryById.get(wholesaler.id) ??
        trimmedText(wholesaler.territory),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const mutations = wholesalers.flatMap((wholesaler) => {
    const territory = seededTerritoryById.get(wholesaler.id);
    if (
      territory === undefined ||
      trimmedText(wholesaler.territory) === territory
    ) {
      return [];
    }

    return [
      {
        id: wholesaler.id,
        expectedUpdatedAt: wholesaler.updatedAt,
        data: { territory },
      },
    ];
  });

  return {
    wholesalerCount: wholesalers.length,
    wholesalerIdentityHash: sha256(
      wholesalers
        .map((wholesaler) => ({
          id: wholesaler.id,
          workspaceMemberId: wholesaler.workspaceMember?.id ?? null,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ),
    expectedTerritoryHash: sha256(expectedRows),
    mutations,
  };
};

const uniqueObjectMap = (
  objects: WorkspaceMetadataObject[],
): Map<string, WorkspaceMetadataObject> => {
  const result = new Map<string, WorkspaceMetadataObject>();
  for (const object of objects) {
    if (result.has(object.nameSingular)) {
      throw new Error(`Duplicate metadata object ${object.nameSingular}`);
    }
    result.set(object.nameSingular, object);
  }
  for (const name of REQUIRED_OBJECT_NAMES) {
    if (!result.has(name)) {
      throw new Error(`Required CRM object ${name} is missing`);
    }
  }

  return result;
};

const uniqueFieldMap = (
  object: WorkspaceMetadataObject,
): Map<string, WorkspaceMetadataField> => {
  const result = new Map<string, WorkspaceMetadataField>();
  for (const field of object.fields) {
    if (result.has(field.name)) {
      throw new Error(
        `Duplicate CRM field ${object.nameSingular}.${field.name}`,
      );
    }
    result.set(field.name, field);
  }

  return result;
};

const relationTargetObjectMetadataId = (
  field: WorkspaceMetadataField,
): string | null | undefined =>
  field.relationTargetObjectMetadataId ??
  field.settings?.relationTargetObjectMetadataId;

const validateManyToOneRelation = ({
  field,
  sourceFieldName,
  targetObject,
}: {
  field: WorkspaceMetadataField;
  sourceFieldName: string;
  targetObject: WorkspaceMetadataObject;
}): void => {
  if (
    field.type !== 'RELATION' ||
    field.settings?.relationType !== 'MANY_TO_ONE' ||
    relationTargetObjectMetadataId(field) !== targetObject.id
  ) {
    throw new Error(
      `${sourceFieldName} must be a MANY_TO_ONE relation to ${targetObject.nameSingular}`,
    );
  }
};

const createFollowUpViewPlan = ({
  outreachActivity,
  outreachFields,
}: {
  outreachActivity: WorkspaceMetadataObject;
  outreachFields: ReadonlyMap<string, WorkspaceMetadataField>;
}) => {
  const fields = FOLLOW_UP_VIEW_FIELD_NAMES.map((name) => {
    const field = outreachFields.get(name);
    if (!field) {
      throw new Error(
        `Required Follow-ups field outreachActivity.${name} is missing`,
      );
    }

    return field;
  });
  const followUpDate = outreachFields.get('followUpDate')!;

  return {
    view: {
      id: MANAGED_FOLLOW_UP_VIEW_ID,
      universalIdentifier: MANAGED_FOLLOW_UP_VIEW_UNIVERSAL_IDENTIFIER,
      name: 'Follow-ups',
      objectMetadataId: outreachActivity.id,
      type: 'TABLE' as const,
      icon: 'IconChecklist',
      position: 2,
      visibility: 'WORKSPACE' as const,
    },
    fields: fields.map((field, position) => ({
      id: MANAGED_FOLLOW_UP_VIEW_FIELD_IDS[position],
      fieldMetadataId: field.id,
      viewId: MANAGED_FOLLOW_UP_VIEW_ID,
      isVisible: true,
      position,
      size: followUpViewFieldSize(field.name),
    })),
    filter: {
      id: MANAGED_FOLLOW_UP_FILTER_ID,
      fieldMetadataId: followUpDate.id,
      viewId: MANAGED_FOLLOW_UP_VIEW_ID,
      operand: 'IS_NOT_EMPTY' as const,
      value: '' as const,
    },
    sort: {
      id: MANAGED_FOLLOW_UP_DATE_SORT_ID,
      fieldMetadataId: followUpDate.id,
      viewId: MANAGED_FOLLOW_UP_VIEW_ID,
      direction: 'ASC' as const,
    },
  };
};

const selectFollowUpView = ({
  views,
  outreachActivity,
}: {
  views: WorkspaceView[];
  outreachActivity: WorkspaceMetadataObject;
}): WorkspaceView | undefined => {
  const managedIdentityViews = views.filter(
    (view) =>
      view.id === MANAGED_FOLLOW_UP_VIEW_ID ||
      view.universalIdentifier === MANAGED_FOLLOW_UP_VIEW_UNIVERSAL_IDENTIFIER,
  );
  if (managedIdentityViews.length === 0) {
    return undefined;
  }
  if (managedIdentityViews.length !== 1) {
    throw new Error('Managed Follow-ups view identity is ambiguous');
  }
  const [managedView] = managedIdentityViews;
  if (
    managedView.id !== MANAGED_FOLLOW_UP_VIEW_ID ||
    managedView.universalIdentifier !==
      MANAGED_FOLLOW_UP_VIEW_UNIVERSAL_IDENTIFIER
  ) {
    throw new Error('Managed Follow-ups view has an invalid managed identity');
  }
  if (managedView.objectMetadataId !== outreachActivity.id) {
    throw new Error('Managed Follow-ups view belongs to another object');
  }
  if (managedView.type !== 'TABLE' || managedView.visibility !== 'WORKSPACE') {
    throw new Error('Managed Follow-ups view is not a workspace table');
  }
  if (managedView.createdByUserWorkspaceId !== null) {
    throw new Error('Managed Follow-ups view must be workspace-owned');
  }

  return managedView;
};

export const buildWorkspaceMetadataBootstrapPlan = (
  snapshot: WorkspaceConfigSnapshot,
): WorkspaceMetadataBootstrapPlan => {
  const objectsByName = uniqueObjectMap(snapshot.objects);
  const company = objectsByName.get('company')!;
  const companyFields = uniqueFieldMap(company);
  const metadataFieldsToCreate: MetadataFieldCreate[] = [];
  const metadataFieldsToUpdate: MetadataFieldUpdate[] = [];

  for (const definition of TERRITORY_FIELD_DEFINITIONS) {
    const existing = companyFields.get(definition.name);
    if (!existing) {
      metadataFieldsToCreate.push({
        objectMetadataId: company.id,
        ...definition,
      });
      continue;
    }
    if (existing.type !== definition.type) {
      throw new Error(
        `Company ${definition.name} must be ${definition.type}, found ${existing.type}`,
      );
    }
    if (existing.label !== definition.label) {
      metadataFieldsToUpdate.push({
        id: existing.id,
        label: definition.label,
      });
    }
  }

  const wholesaler = objectsByName.get('wholesaler')!;
  const workspaceMember = objectsByName.get('workspaceMember')!;

  const historicalOwner = companyFields.get('historicalOwner');
  if (!historicalOwner) {
    throw new Error('Required company field historicalOwner is missing');
  }
  validateManyToOneRelation({
    field: historicalOwner,
    sourceFieldName: 'Company historicalOwner',
    targetObject: wholesaler,
  });
  if (historicalOwner.label !== 'Wholesaler') {
    metadataFieldsToUpdate.push({
      id: historicalOwner.id,
      label: 'Wholesaler',
    });
  }

  const wholesalerFields = uniqueFieldMap(wholesaler);
  const territoryField = wholesalerFields.get(
    WHOLESALER_TERRITORY_FIELD_DEFINITION.name,
  );
  if (!territoryField) {
    metadataFieldsToCreate.push({
      objectMetadataId: wholesaler.id,
      ...WHOLESALER_TERRITORY_FIELD_DEFINITION,
    });
  } else if (
    territoryField.type !== WHOLESALER_TERRITORY_FIELD_DEFINITION.type
  ) {
    throw new Error('Wholesaler territory must be TEXT');
  } else if (
    territoryField.label !== WHOLESALER_TERRITORY_FIELD_DEFINITION.label
  ) {
    metadataFieldsToUpdate.push({
      id: territoryField.id,
      label: WHOLESALER_TERRITORY_FIELD_DEFINITION.label,
    });
  }

  const outreachActivity = objectsByName.get('outreachActivity')!;
  const outreachFields = uniqueFieldMap(outreachActivity);
  for (const definition of QUICK_LOG_SCALAR_FIELD_DEFINITIONS) {
    const field = outreachFields.get(definition.name);
    if (!field) {
      metadataFieldsToCreate.push({
        objectMetadataId: outreachActivity.id,
        ...definition,
      });
      continue;
    }
    if (field.type !== definition.type) {
      throw new Error(
        `Outreach Activity ${definition.name} must be ${definition.type}, found ${field.type}`,
      );
    }
    const expectedDefaultValue =
      'defaultValue' in definition ? definition.defaultValue : undefined;
    const labelDrifted = field.label !== definition.label;
    const defaultDrifted =
      (field.defaultValue ?? undefined) !== expectedDefaultValue;
    if (labelDrifted || defaultDrifted) {
      metadataFieldsToUpdate.push({
        id: field.id,
        label: definition.label,
        ...(expectedDefaultValue === undefined
          ? {}
          : { defaultValue: expectedDefaultValue }),
      });
    }
  }
  for (const definition of QUICK_LOG_RELATION_FIELD_DEFINITIONS) {
    const field = outreachFields.get(definition.name);
    if (!field) {
      metadataFieldsToCreate.push({
        objectMetadataId: outreachActivity.id,
        name: definition.name,
        label: definition.label,
        type: 'RELATION',
        relationCreationPayload: {
          targetObjectMetadataId: objectsByName.get(
            definition.targetObjectName,
          )!.id,
          targetFieldLabel: definition.targetFieldLabel,
          targetFieldIcon: 'IconLink',
          type: 'MANY_TO_ONE',
        },
      });
      continue;
    }
    validateManyToOneRelation({
      field,
      sourceFieldName: `Outreach Activity ${definition.name}`,
      targetObject: objectsByName.get(definition.targetObjectName)!,
    });
    if (field.label !== definition.label) {
      metadataFieldsToUpdate.push({ id: field.id, label: definition.label });
    }
  }

  const workspaceMemberRelation = wholesalerFields.get('workspaceMember');
  if (!workspaceMemberRelation) {
    metadataFieldsToCreate.push({
      objectMetadataId: wholesaler.id,
      name: 'workspaceMember',
      label: 'Workspace Member',
      type: 'RELATION',
      relationCreationPayload: {
        targetObjectMetadataId: workspaceMember.id,
        targetFieldLabel: 'Wholesaler Profiles',
        targetFieldIcon: 'IconUser',
        type: 'MANY_TO_ONE',
      },
    });
  } else {
    const targetObjectMetadataId = relationTargetObjectMetadataId(
      workspaceMemberRelation,
    );
    let inverseRelation: WorkspaceMetadataField | undefined;
    if (workspaceMemberRelation.relationTargetFieldMetadataId) {
      inverseRelation = workspaceMember.fields.find(
        ({ id }) =>
          id === workspaceMemberRelation.relationTargetFieldMetadataId,
      );
    } else {
      const structuralCandidates = workspaceMember.fields.filter(
        (field) =>
          field.type === 'RELATION' &&
          field.settings?.relationType === 'ONE_TO_MANY' &&
          relationTargetObjectMetadataId(field) === wholesaler.id,
      );
      if (structuralCandidates.length === 1) {
        [inverseRelation] = structuralCandidates;
      }
    }
    const inverseTargetObjectMetadataId =
      inverseRelation?.relationTargetObjectMetadataId ??
      inverseRelation?.settings?.relationTargetObjectMetadataId;
    if (
      workspaceMemberRelation.type !== 'RELATION' ||
      workspaceMemberRelation.settings?.relationType !== 'MANY_TO_ONE' ||
      targetObjectMetadataId !== workspaceMember.id ||
      inverseRelation?.type !== 'RELATION' ||
      inverseRelation.settings?.relationType !== 'ONE_TO_MANY' ||
      inverseTargetObjectMetadataId !== wholesaler.id ||
      (inverseRelation.relationTargetFieldMetadataId != null &&
        inverseRelation.relationTargetFieldMetadataId !==
          workspaceMemberRelation.id) ||
      inverseRelation.label !== 'Wholesaler Profiles' ||
      inverseRelation.icon !== 'IconUser'
    ) {
      throw new Error(
        'Wholesaler workspaceMember relation and inverse contract are incompatible',
      );
    }
    if (workspaceMemberRelation.label !== 'Workspace Member') {
      metadataFieldsToUpdate.push({
        id: workspaceMemberRelation.id,
        label: 'Workspace Member',
      });
    }
  }

  return { metadataFieldsToCreate, metadataFieldsToUpdate };
};

export const buildWorkspaceConfigPlan = (
  snapshot: WorkspaceConfigSnapshot,
): WorkspaceConfigPlan => {
  const metadataPlan = buildWorkspaceMetadataBootstrapPlan(snapshot);
  if (metadataPlan.metadataFieldsToCreate.length > 0) {
    return { ...metadataPlan, layout: null };
  }

  const objectsByName = uniqueObjectMap(snapshot.objects);
  const company = objectsByName.get('company')!;
  const companyFields = uniqueFieldMap(company);
  const person = objectsByName.get('person')!;
  const personFields = uniqueFieldMap(person);
  const outreachActivity = objectsByName.get('outreachActivity')!;
  const outreachFields = uniqueFieldMap(outreachActivity);

  for (const fieldName of VISIBLE_COMPANY_FIELD_NAMES) {
    if (!companyFields.has(fieldName)) {
      throw new Error(`Required company field ${fieldName} is missing`);
    }
  }
  for (const fieldName of VISIBLE_PERSON_FIELD_NAMES) {
    if (!personFields.has(fieldName)) {
      throw new Error(`Required person field ${fieldName} is missing`);
    }
  }
  if (companyFields.get('address')!.type !== 'ADDRESS') {
    throw new Error('Company address must remain a native ADDRESS field');
  }
  if (companyFields.get('linkedinLink')!.type !== 'LINKS') {
    throw new Error('Company linkedinLink must remain a native LINKS field');
  }

  const companyIndexViews = snapshot.views.filter(
    (view) => view.objectMetadataId === company.id && view.key === 'INDEX',
  );
  if (companyIndexViews.length !== 1) {
    throw new Error('Exactly one Company index view is required');
  }
  const companyIndexView = companyIndexViews[0]!;
  const desiredPositionByFieldId = new Map(
    VISIBLE_COMPANY_FIELD_NAMES.map((name, position) => [
      companyFields.get(name)!.id,
      position,
    ]),
  );
  const desiredCompanySizeByFieldId = new Map(
    VISIBLE_COMPANY_FIELD_NAMES.map((name) => [
      companyFields.get(name)!.id,
      companyViewFieldSize(name),
    ]),
  );
  const existingCompanyViewFieldByMetadataId = new Map<
    string,
    WorkspaceViewField
  >();
  const companyFieldIds = new Set(company.fields.map(({ id }) => id));
  for (const viewField of companyIndexView.viewFields) {
    if (!companyFieldIds.has(viewField.fieldMetadataId)) {
      throw new Error('Company index references an unknown metadata field');
    }
    if (existingCompanyViewFieldByMetadataId.has(viewField.fieldMetadataId)) {
      throw new Error('Company index has duplicate view fields');
    }
    existingCompanyViewFieldByMetadataId.set(
      viewField.fieldMetadataId,
      viewField,
    );
  }
  const viewFieldsToCreate: WorkspaceLayoutPlan['viewFieldsToCreate'] = [];
  const viewFieldUpdates: WorkspaceLayoutPlan['viewFieldUpdates'] = [];
  for (const field of company.fields) {
    const desiredPosition = desiredPositionByFieldId.get(field.id);
    const shouldBeVisible = desiredPosition !== undefined;
    const existing = existingCompanyViewFieldByMetadataId.get(field.id);
    if (!existing) {
      if (shouldBeVisible) {
        const desiredSize = desiredCompanySizeByFieldId.get(field.id)!;
        viewFieldsToCreate.push({
          fieldMetadataId: field.id,
          viewId: companyIndexView.id,
          isVisible: true,
          position: desiredPosition,
          size: desiredSize,
        });
      }
      continue;
    }
    if (
      existing.isVisible !== shouldBeVisible ||
      (shouldBeVisible &&
        (existing.position !== desiredPosition ||
          existing.size !== desiredCompanySizeByFieldId.get(field.id)))
    ) {
      viewFieldUpdates.push({
        id: existing.id,
        update: {
          isVisible: shouldBeVisible,
          ...(shouldBeVisible
            ? {
                position: desiredPosition,
                size: desiredCompanySizeByFieldId.get(field.id),
              }
            : {}),
        },
      });
    }
  }

  const personIndexViews = snapshot.views.filter(
    (view) => view.objectMetadataId === person.id && view.key === 'INDEX',
  );
  if (personIndexViews.length !== 1) {
    throw new Error('Exactly one Person index view is required');
  }
  const personIndexView = personIndexViews[0]!;
  const desiredPersonPositionByFieldId = new Map(
    VISIBLE_PERSON_FIELD_NAMES.map((name, position) => [
      personFields.get(name)!.id,
      position,
    ]),
  );
  const existingPersonViewFieldByMetadataId = new Map<
    string,
    WorkspaceViewField
  >();
  const personFieldIds = new Set(person.fields.map(({ id }) => id));
  for (const viewField of personIndexView.viewFields) {
    if (!personFieldIds.has(viewField.fieldMetadataId)) {
      throw new Error('Person index references an unknown metadata field');
    }
    if (existingPersonViewFieldByMetadataId.has(viewField.fieldMetadataId)) {
      throw new Error('Person index has duplicate view fields');
    }
    existingPersonViewFieldByMetadataId.set(
      viewField.fieldMetadataId,
      viewField,
    );
  }
  for (const field of person.fields) {
    const desiredPosition = desiredPersonPositionByFieldId.get(field.id);
    const shouldBeVisible = desiredPosition !== undefined;
    const existing = existingPersonViewFieldByMetadataId.get(field.id);
    if (!existing) {
      if (shouldBeVisible) {
        viewFieldsToCreate.push({
          fieldMetadataId: field.id,
          viewId: personIndexView.id,
          isVisible: true,
          position: desiredPosition,
          size: personViewFieldSize(field.name),
        });
      }
      continue;
    }
    if (
      existing.isVisible !== shouldBeVisible ||
      (shouldBeVisible &&
        (existing.position !== desiredPosition ||
          existing.size !== personViewFieldSize(field.name)))
    ) {
      viewFieldUpdates.push({
        id: existing.id,
        update: {
          isVisible: shouldBeVisible,
          ...(shouldBeVisible
            ? {
                position: desiredPosition,
                size: personViewFieldSize(field.name),
              }
            : {}),
        },
      });
    }
  }

  const addressField = companyFields.get('address')!;
  const desiredSort = companyIndexView.viewSorts.find(
    (sort) =>
      sort.fieldMetadataId === addressField.id &&
      sort.direction === 'ASC' &&
      sort.subFieldName === ADDRESS_STATE_SUBFIELD,
  );
  const viewSortIdsToDelete = companyIndexView.viewSorts
    .filter((sort) => sort.id !== desiredSort?.id)
    .map(({ id }) => id);
  const viewSortsToCreate: WorkspaceLayoutPlan['viewSortsToCreate'] =
    desiredSort
      ? []
      : [
          {
            id: MANAGED_COMPANY_STATE_SORT_ID,
            fieldMetadataId: addressField.id,
            viewId: companyIndexView.id,
            direction: 'ASC' as const,
            subFieldName: ADDRESS_STATE_SUBFIELD,
          },
        ];

  for (const fieldName of FOLLOW_UP_VIEW_FIELD_NAMES) {
    if (!outreachFields.has(fieldName)) {
      throw new Error(
        `Required Follow-ups field outreachActivity.${fieldName} is missing`,
      );
    }
  }
  const followUpDate = outreachFields.get('followUpDate')!;
  const followUpView = selectFollowUpView({
    views: snapshot.views,
    outreachActivity,
  });
  const newFollowUp = followUpView
    ? undefined
    : createFollowUpViewPlan({ outreachActivity, outreachFields });
  const followUpViewId = followUpView?.id ?? MANAGED_FOLLOW_UP_VIEW_ID;
  if (newFollowUp) {
    viewFieldsToCreate.push(...newFollowUp.fields);
  } else {
    const desiredOutreachPositionByFieldId = new Map(
      FOLLOW_UP_VIEW_FIELD_NAMES.map((name, position) => [
        outreachFields.get(name)!.id,
        position,
      ]),
    );
    const desiredOutreachSizeByFieldId = new Map(
      FOLLOW_UP_VIEW_FIELD_NAMES.map((name) => [
        outreachFields.get(name)!.id,
        followUpViewFieldSize(name),
      ]),
    );
    const existingByFieldId = new Map<string, WorkspaceViewField>();
    const outreachFieldIds = new Set(
      outreachActivity.fields.map(({ id }) => id),
    );
    for (const viewField of followUpView.viewFields) {
      if (!outreachFieldIds.has(viewField.fieldMetadataId)) {
        throw new Error('Follow-ups view references an unknown metadata field');
      }
      if (existingByFieldId.has(viewField.fieldMetadataId)) {
        throw new Error('Follow-ups view has duplicate view fields');
      }
      existingByFieldId.set(viewField.fieldMetadataId, viewField);
    }
    for (const field of outreachActivity.fields) {
      const desiredPosition = desiredOutreachPositionByFieldId.get(field.id);
      const shouldBeVisible = desiredPosition !== undefined;
      const existing = existingByFieldId.get(field.id);
      if (!existing) {
        if (shouldBeVisible) {
          const desiredSize = desiredOutreachSizeByFieldId.get(field.id)!;
          viewFieldsToCreate.push({
            fieldMetadataId: field.id,
            viewId: followUpViewId,
            isVisible: true,
            position: desiredPosition,
            size: desiredSize,
          });
        }
        continue;
      }
      if (
        existing.isVisible !== shouldBeVisible ||
        (shouldBeVisible &&
          (existing.position !== desiredPosition ||
            existing.size !== desiredOutreachSizeByFieldId.get(field.id)))
      ) {
        viewFieldUpdates.push({
          id: existing.id,
          update: {
            isVisible: shouldBeVisible,
            ...(shouldBeVisible
              ? {
                  position: desiredPosition,
                  size: desiredOutreachSizeByFieldId.get(field.id),
                }
              : {}),
          },
        });
      }
    }
  }
  const viewUpdates: WorkspaceLayoutPlan['viewUpdates'] = [];
  if (
    followUpView &&
    (followUpView.name !== 'Follow-ups' ||
      followUpView.icon !== 'IconChecklist' ||
      followUpView.position !== 2)
  ) {
    viewUpdates.push({
      id: followUpView.id,
      update: {
        ...(followUpView.name !== 'Follow-ups' ? { name: 'Follow-ups' } : {}),
        ...(followUpView.icon !== 'IconChecklist'
          ? { icon: 'IconChecklist' }
          : {}),
        ...(followUpView.position !== 2 ? { position: 2 } : {}),
      },
    });
  }

  const desiredFollowUpFilter = followUpView?.viewFilters.find(
    (filter) =>
      filter.fieldMetadataId === followUpDate.id &&
      filter.operand === 'IS_NOT_EMPTY' &&
      filter.value === '',
  );
  const viewFilterIdsToDelete = (followUpView?.viewFilters ?? [])
    .filter((filter) => filter.id !== desiredFollowUpFilter?.id)
    .map(({ id }) => id);
  const desiredFollowUpSort = followUpView?.viewSorts.find(
    (sort) =>
      sort.fieldMetadataId === followUpDate.id &&
      sort.direction === 'ASC' &&
      !sort.subFieldName,
  );
  viewSortIdsToDelete.push(
    ...(followUpView?.viewSorts ?? [])
      .filter((sort) => sort.id !== desiredFollowUpSort?.id)
      .map(({ id }) => id),
  );
  if (!desiredFollowUpSort && !newFollowUp) {
    viewSortsToCreate.push({
      id: MANAGED_FOLLOW_UP_DATE_SORT_ID,
      fieldMetadataId: followUpDate.id,
      viewId: followUpViewId,
      direction: 'ASC',
    });
  }

  const desiredNavigation = [
    {
      key: 'company',
      type: 'OBJECT' as const,
      targetObjectMetadataId: company.id,
      position: 0,
    },
    {
      key: 'person',
      type: 'OBJECT' as const,
      targetObjectMetadataId: objectsByName.get('person')!.id,
      position: 1,
    },
    {
      key: 'wholesaler',
      type: 'OBJECT' as const,
      targetObjectMetadataId: objectsByName.get('wholesaler')!.id,
      position: 2,
    },
    {
      key: 'salesTeam',
      type: 'OBJECT' as const,
      targetObjectMetadataId: objectsByName.get('salesTeam')!.id,
      position: 3,
    },
    {
      key: 'followUps',
      type: 'VIEW' as const,
      viewId: followUpViewId,
      position: 4,
    },
  ];
  const workspaceItems = snapshot.navigationMenuItems.filter(
    (item) => !item.userWorkspaceId,
  );
  const navigationItemsToCreate: WorkspaceLayoutPlan['navigationItemsToCreate'] =
    [];
  const navigationItemUpdates: WorkspaceLayoutPlan['navigationItemUpdates'] =
    [];
  const retainedIds = new Set<string>();
  for (const desired of desiredNavigation) {
    const candidates = workspaceItems
      .filter((item) =>
        desired.type === 'OBJECT'
          ? item.type === desired.type &&
            item.targetObjectMetadataId === desired.targetObjectMetadataId
          : item.type === desired.type && item.viewId === desired.viewId,
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    const retained = candidates[0];
    if (!retained) {
      navigationItemsToCreate.push({
        ...(desired.key === 'followUps'
          ? { id: MANAGED_FOLLOW_UP_NAVIGATION_ID }
          : {}),
        type: desired.type,
        ...(desired.type === 'OBJECT'
          ? { targetObjectMetadataId: desired.targetObjectMetadataId }
          : { viewId: desired.viewId }),
        position: desired.position,
      });
      continue;
    }
    retainedIds.add(retained.id);
    if (retained.position !== desired.position || retained.folderId) {
      navigationItemUpdates.push({
        id: retained.id,
        update: { position: desired.position, folderId: null },
      });
    }
  }
  const navigationItemIdsToDelete = workspaceItems
    .filter((item) => !retainedIds.has(item.id))
    .map(({ id }) => id);

  return {
    ...metadataPlan,
    layout: {
      visibleCompanyFieldNames: [...VISIBLE_COMPANY_FIELD_NAMES],
      visiblePersonFieldNames: [...VISIBLE_PERSON_FIELD_NAMES],
      viewsToCreate: newFollowUp ? [newFollowUp.view] : [],
      viewUpdates,
      viewFieldsToCreate,
      viewFieldUpdates,
      viewFiltersToCreate:
        newFollowUp || desiredFollowUpFilter
          ? newFollowUp
            ? [newFollowUp.filter]
            : []
          : [
              {
                id: MANAGED_FOLLOW_UP_FILTER_ID,
                fieldMetadataId: followUpDate.id,
                viewId: followUpViewId,
                operand: 'IS_NOT_EMPTY',
                value: '',
              },
            ],
      viewFilterIdsToDelete,
      viewSortIdsToDelete,
      viewSortsToCreate: newFollowUp
        ? [...viewSortsToCreate, newFollowUp.sort]
        : viewSortsToCreate,
      navigationItemIdsToDelete,
      navigationItemsToCreate,
      navigationItemUpdates,
    },
  };
};

export const workspaceConfigOperationCount = (
  plan: WorkspaceConfigPlan,
): number =>
  plan.metadataFieldsToCreate.length +
  plan.metadataFieldsToUpdate.length +
  (plan.layout
    ? plan.layout.viewsToCreate.length +
      plan.layout.viewUpdates.length +
      plan.layout.viewFieldsToCreate.length +
      plan.layout.viewFieldUpdates.length +
      plan.layout.viewFiltersToCreate.length +
      plan.layout.viewFilterIdsToDelete.length +
      plan.layout.viewSortIdsToDelete.length +
      plan.layout.viewSortsToCreate.length +
      plan.layout.navigationItemIdsToDelete.length +
      plan.layout.navigationItemsToCreate.length +
      plan.layout.navigationItemUpdates.length
    : 0);

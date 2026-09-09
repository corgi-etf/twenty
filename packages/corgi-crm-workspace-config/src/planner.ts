import { createHash } from 'node:crypto';

export const ADDRESS_STATE_SUBFIELD = 'addressState';
export const MANAGED_FOLLOW_UP_VIEW_ID = 'c0671000-0000-4000-8000-000000000001';
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

type MetadataFieldCreate = {
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

type MetadataFieldUpdate = {
  id: string;
  label: string;
};

export type WorkspaceLayoutPlan = {
  visibleCompanyFieldNames: string[];
  viewsToCreate: Array<{
    id: string;
    name: string;
    objectMetadataId: string;
    type: 'TABLE';
    icon: string;
    position: number;
    visibility: 'WORKSPACE';
  }>;
  viewUpdates: Array<{
    id: string;
    update: { name?: string; icon?: string };
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
    update: { isVisible: boolean; position?: number };
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
      size: position === 0 ? 210 : 150,
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
  const managed = views.filter(
    (view) =>
      view.id === MANAGED_FOLLOW_UP_VIEW_ID &&
      view.objectMetadataId === outreachActivity.id,
  );
  if (managed.length > 1) {
    throw new Error('Duplicate managed Follow-ups views are ambiguous');
  }
  if (managed.length === 1) return managed[0];
  const namedViews = views.filter(
    (view) =>
      view.objectMetadataId === outreachActivity.id &&
      view.name === 'Follow-ups',
  );
  if (namedViews.length > 1) {
    throw new Error('Duplicate Follow-ups views are ambiguous');
  }
  return namedViews[0];
};

export const buildWorkspaceConfigPlan = (
  snapshot: WorkspaceConfigSnapshot,
): WorkspaceConfigPlan => {
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
  const wholesalerFields = uniqueFieldMap(wholesaler);
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
    const relationTargetObjectMetadataId =
      workspaceMemberRelation.relationTargetObjectMetadataId ??
      workspaceMemberRelation.settings?.relationTargetObjectMetadataId;
    const inverseRelation =
      workspaceMemberRelation.relationTargetFieldMetadataId
        ? workspaceMember.fields.find(
            ({ id }) =>
              id === workspaceMemberRelation.relationTargetFieldMetadataId,
          )
        : undefined;
    const inverseTargetObjectMetadataId =
      inverseRelation?.relationTargetObjectMetadataId ??
      inverseRelation?.settings?.relationTargetObjectMetadataId;
    if (
      workspaceMemberRelation.type !== 'RELATION' ||
      workspaceMemberRelation.settings?.relationType !== 'MANY_TO_ONE' ||
      relationTargetObjectMetadataId !== workspaceMember.id ||
      inverseRelation?.type !== 'RELATION' ||
      inverseRelation.settings?.relationType !== 'ONE_TO_MANY' ||
      inverseTargetObjectMetadataId !== wholesaler.id ||
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

  if (metadataFieldsToCreate.length > 0) {
    return {
      metadataFieldsToCreate,
      metadataFieldsToUpdate,
      layout: null,
    };
  }

  for (const fieldName of VISIBLE_COMPANY_FIELD_NAMES) {
    if (!companyFields.has(fieldName)) {
      throw new Error(`Required company field ${fieldName} is missing`);
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
        viewFieldsToCreate.push({
          fieldMetadataId: field.id,
          viewId: companyIndexView.id,
          isVisible: true,
          position: desiredPosition,
          size: field.name === 'address' ? 250 : 150,
        });
      }
      continue;
    }
    if (
      existing.isVisible !== shouldBeVisible ||
      (shouldBeVisible && existing.position !== desiredPosition)
    ) {
      viewFieldUpdates.push({
        id: existing.id,
        update: {
          isVisible: shouldBeVisible,
          ...(shouldBeVisible ? { position: desiredPosition } : {}),
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

  const outreachActivity = objectsByName.get('outreachActivity')!;
  const outreachFields = uniqueFieldMap(outreachActivity);
  for (const fieldName of FOLLOW_UP_VIEW_FIELD_NAMES) {
    if (!outreachFields.has(fieldName)) {
      throw new Error(
        `Required Follow-ups field outreachActivity.${fieldName} is missing`,
      );
    }
  }
  const followUpDate = outreachFields.get('followUpDate')!;
  if (!['DATE', 'DATE_TIME'].includes(followUpDate.type)) {
    throw new Error(
      'Follow-ups followUpDate must be a DATE or DATE_TIME field',
    );
  }
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
          viewFieldsToCreate.push({
            fieldMetadataId: field.id,
            viewId: followUpViewId,
            isVisible: true,
            position: desiredPosition,
            size: field.name === 'notes' ? 250 : 150,
          });
        }
        continue;
      }
      if (
        existing.isVisible !== shouldBeVisible ||
        (shouldBeVisible && existing.position !== desiredPosition)
      ) {
        viewFieldUpdates.push({
          id: existing.id,
          update: {
            isVisible: shouldBeVisible,
            ...(shouldBeVisible ? { position: desiredPosition } : {}),
          },
        });
      }
    }
  }
  const viewUpdates: WorkspaceLayoutPlan['viewUpdates'] = [];
  if (
    followUpView &&
    (followUpView.name !== 'Follow-ups' ||
      followUpView.icon !== 'IconChecklist')
  ) {
    viewUpdates.push({
      id: followUpView.id,
      update: {
        ...(followUpView.name !== 'Follow-ups' ? { name: 'Follow-ups' } : {}),
        ...(followUpView.icon !== 'IconChecklist'
          ? { icon: 'IconChecklist' }
          : {}),
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
    metadataFieldsToCreate,
    metadataFieldsToUpdate,
    layout: {
      visibleCompanyFieldNames: [...VISIBLE_COMPANY_FIELD_NAMES],
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

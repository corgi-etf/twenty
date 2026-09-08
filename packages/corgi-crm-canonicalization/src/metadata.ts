export type MetadataField = {
  id: string;
  name: string;
  label: string;
  type: string;
  relationTargetObjectMetadataId?: string | null;
  settings?: { relationTargetObjectMetadataId?: string | null } | null;
};

export type MetadataObject = {
  id: string;
  nameSingular: string;
  fields: MetadataField[];
};

type FieldDefinition = {
  objectName: string;
  name: string;
  label: string;
  type: string;
  relationTargetObjectName?: string;
  targetFieldLabel?: string;
};

export type MetadataRename = {
  objectName: string;
  fieldId: string;
  currentName: string;
  targetName: string;
  targetLabel: string;
};

export type MetadataCreate = Omit<
  FieldDefinition,
  'relationTargetObjectName'
> & {
  objectMetadataId: string;
  relationTargetObjectMetadataId?: string;
  targetFieldLabel?: string;
};

export type MetadataPlan = {
  renames: MetadataRename[];
  creates: MetadataCreate[];
};

const RENAME_DEFINITIONS: readonly (FieldDefinition & {
  currentName: string;
})[] = [
  {
    objectName: 'company',
    currentName: 'fetchStatus',
    name: 'leadStatus',
    label: 'Lead Status',
    type: 'TEXT',
  },
  {
    objectName: 'company',
    currentName: 'fetchTags',
    name: 'tags',
    label: 'Tags',
    type: 'MULTI_SELECT',
  },
  {
    objectName: 'holdingObservation',
    currentName: 'sourceDate',
    name: 'asOfDate',
    label: 'As Of Date',
    type: 'DATE',
  },
  {
    objectName: 'person',
    currentName: 'legacyAddress',
    name: 'streetAddress',
    label: 'Street Address',
    type: 'TEXT',
  },
  {
    objectName: 'person',
    currentName: 'legacyCity',
    name: 'city',
    label: 'City',
    type: 'TEXT',
  },
  {
    objectName: 'person',
    currentName: 'legacyStateRegion',
    name: 'stateRegion',
    label: 'State / Region',
    type: 'TEXT',
  },
  {
    objectName: 'person',
    currentName: 'legacyPostalCode',
    name: 'postalCode',
    label: 'Postal Code',
    type: 'TEXT',
  },
  {
    objectName: 'person',
    currentName: 'fetchNotes',
    name: 'notes',
    label: 'Notes',
    type: 'TEXT',
  },
  {
    objectName: 'wholesaler',
    currentName: 'fetchRole',
    name: 'role',
    label: 'Role',
    type: 'TEXT',
  },
];

const fields = (
  objectName: string,
  definitions: ReadonlyArray<[string, string, string?]>,
): FieldDefinition[] =>
  definitions.map(([name, label, type = 'TEXT']) => ({
    objectName,
    name,
    label,
    type,
  }));

const CREATE_DEFINITIONS: readonly FieldDefinition[] = [
  ...fields('company', [
    ['description', 'Description'],
    ['firmPhone', 'Firm Phone'],
    ['websiteNotes', 'Website Notes'],
    ['assetsUnderManagement', 'Assets Under Management'],
    ['brokerDealerRepresentatives', 'Broker-Dealer Representatives'],
    ['investmentAdviserRepresentatives', 'Investment Adviser Representatives'],
    ['custodians', 'Custodians'],
    ['form13f', 'Form 13F'],
    ['totalAccounts', 'Total Accounts'],
    ['employees', 'Employees', 'NUMBER'],
    ['ownership', 'Ownership'],
    ['filerId', 'Filer ID'],
    ['cik', 'CIK'],
    ['crd', 'CRD'],
    ['irsNumber', 'IRS Number'],
    ['accreditedInvestorFocus', 'Accredited Investor Focus'],
    ['assetClasses', 'Asset Classes'],
    ['clientPersonas', 'Client Personas'],
    ['crmSystem', 'CRM System'],
    ['fundManagers', 'Fund Managers'],
    ['investmentThemes', 'Investment Themes'],
    ['investmentVehicles', 'Investment Vehicles'],
    ['platform', 'Platform'],
    ['services', 'Services'],
    ['technology', 'Technology'],
    ['familyOfficeType', 'Family Office Type'],
    ['familyOfficeGeneration', 'Family Office Generation'],
    ['familyOfficeWealthOrigin', 'Family Office Wealth Origin'],
    ['familyOfficeFocus', 'Family Office Focus'],
    ['familyOfficeGeography', 'Family Office Geography'],
  ]),
  ...fields('person', [
    ['profile', 'Profile'],
    ['gender', 'Gender'],
    ['estimatedAge', 'Estimated Age'],
    ['bio', 'Bio'],
    ['brokerDealer', 'Broker-Dealer'],
    ['designations', 'Designations'],
    ['licensesAndExams', 'Licenses & Exams'],
    ['registrationType', 'Registration Type'],
    ['yearsOfExperience', 'Years of Experience'],
    ['yearsWithCurrentFirm', 'Years With Current Firm'],
    ['previousBrokerDealer', 'Previous Broker-Dealer'],
    ['previousFirm', 'Previous Firm'],
    ['nonAdvisor', 'Non-Advisor'],
    ['secProfile', 'SEC Profile'],
    ['finraProfile', 'FINRA Profile'],
    ['metroArea', 'Metro Area'],
    ['teamName', 'Team Name'],
    ['teamWebsite', 'Team Website'],
    ['family', 'Family'],
    ['hobbies', 'Hobbies'],
    ['militaryService', 'Military Service'],
    ['school', 'School'],
    ['sportsTeams', 'Sports Teams'],
    ['services', 'Services'],
    ['otherContactDetails', 'Other Contact Details'],
  ]),
  ...fields('holdingObservation', [
    ['ownershipPercent', 'Ownership Percent', 'NUMBER'],
    ['averagePrice', 'Average Price', 'NUMBER'],
    ['shareChange', 'Share Change', 'NUMBER'],
    ['shareChangePercent', 'Share Change Percent', 'NUMBER'],
    ['previousPortfolioPercent', 'Previous Portfolio Percent', 'NUMBER'],
    ['firstOwnedQuarter', 'First Owned Quarter'],
    ['ranking', 'Ranking', 'NUMBER'],
    ['previousRanking', 'Previous Ranking', 'NUMBER'],
    ['filerIrsNumber', 'Filer IRS Number'],
    ['addressLine2', 'Address Line 2'],
    ['streetAddress', 'Street Address'],
    ['filingType', 'Filing Type'],
    ['form13f', 'Form 13F'],
  ]),
  {
    objectName: 'task',
    name: 'wholesaler',
    label: 'Wholesaler',
    type: 'RELATION',
    relationTargetObjectName: 'wholesaler',
    targetFieldLabel: 'Tasks',
  },
  {
    objectName: 'outreachActivity',
    name: 'followUpTask',
    label: 'Follow-up Task',
    type: 'RELATION',
    relationTargetObjectName: 'task',
    targetFieldLabel: 'Outreach Activities',
  },
  ...fields('outreachActivity', [['followUpDate', 'Follow-up Date', 'DATE']]),
];

const objectByName = (objects: readonly MetadataObject[]) =>
  new Map(objects.map((object) => [object.nameSingular, object]));

const assertCompatible = (
  objectName: string,
  definition: Pick<FieldDefinition, 'name' | 'type'>,
  field: MetadataField,
  expectedRelationTargetId?: string,
): void => {
  if (field.type !== definition.type) {
    throw new Error(
      `${objectName}.${definition.name} is ${field.type}; expected ${definition.type}`,
    );
  }
  if (
    expectedRelationTargetId !== undefined &&
    (field.relationTargetObjectMetadataId ??
      field.settings?.relationTargetObjectMetadataId) !==
      expectedRelationTargetId
  ) {
    throw new Error(
      `${objectName}.${definition.name} points to an incompatible relation target`,
    );
  }
};

export const buildMetadataPlan = (
  objects: readonly MetadataObject[],
): MetadataPlan => {
  const objectsByName = objectByName(objects);
  const renames: MetadataRename[] = [];
  const creates: MetadataCreate[] = [];

  for (const definition of RENAME_DEFINITIONS) {
    const object = objectsByName.get(definition.objectName);
    if (!object)
      throw new Error(`Missing metadata object ${definition.objectName}`);

    const current = object.fields.find(
      ({ name }) => name === definition.currentName,
    );
    const target = object.fields.find(({ name }) => name === definition.name);

    if (current && target) {
      throw new Error(
        `Cannot rename ${definition.objectName}.${definition.currentName}: ${definition.name} already exists`,
      );
    }
    if (target) {
      assertCompatible(definition.objectName, definition, target);
      continue;
    }
    if (!current) continue;

    assertCompatible(definition.objectName, definition, current);
    renames.push({
      objectName: definition.objectName,
      fieldId: current.id,
      currentName: definition.currentName,
      targetName: definition.name,
      targetLabel: definition.label,
    });
  }

  for (const definition of CREATE_DEFINITIONS) {
    const object = objectsByName.get(definition.objectName);
    if (!object)
      throw new Error(`Missing metadata object ${definition.objectName}`);
    const relationTarget = definition.relationTargetObjectName
      ? objectsByName.get(definition.relationTargetObjectName)
      : undefined;
    if (definition.relationTargetObjectName && !relationTarget) {
      throw new Error(
        `Missing relation target ${definition.relationTargetObjectName}`,
      );
    }

    const existing = object.fields.find(({ name }) => name === definition.name);
    if (existing) {
      assertCompatible(
        definition.objectName,
        definition,
        existing,
        relationTarget?.id,
      );
      continue;
    }

    creates.push({
      objectName: definition.objectName,
      objectMetadataId: object.id,
      name: definition.name,
      label: definition.label,
      type: definition.type,
      relationTargetObjectMetadataId: relationTarget?.id,
      targetFieldLabel: definition.targetFieldLabel,
    });
  }

  return { renames, creates };
};

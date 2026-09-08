import type { SourceTag } from './planner.ts';
import { deterministicId } from './deterministic-id.ts';

export type FieldDefinition = {
  objectName: string;
  name: string;
  label: string;
  type: string;
  isUnique?: boolean;
  options?: Array<Record<string, unknown>>;
  relation?: {
    targetObjectName: string;
    targetFieldLabel: string;
    targetFieldIcon: string;
    type: 'MANY_TO_ONE';
  };
};

export type ObjectDefinition = {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  icon: string;
};

export type MigrationSchema = {
  objects: ObjectDefinition[];
  fields: FieldDefinition[];
};

const tagValue = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const object = (
  nameSingular: string,
  namePlural: string,
  labelSingular: string,
  labelPlural: string,
  icon: string,
): ObjectDefinition => ({
  nameSingular,
  namePlural,
  labelSingular,
  labelPlural,
  icon,
});

const field = (
  objectName: string,
  name: string,
  label: string,
  type = 'TEXT',
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({ objectName, name, label, type, ...extra });

const provenanceFields = (objectName: string): FieldDefinition[] => [
  field(objectName, 'legacyFetchId', 'Legacy Fetch ID', 'TEXT', {
    isUnique: true,
  }),
  field(objectName, 'migrationRunId', 'Migration Run ID'),
  field(objectName, 'sourceRowHmac', 'Source Row HMAC'),
  field(objectName, 'sourceCreatedAt', 'Source Creation Date', 'DATE_TIME'),
  field(objectName, 'sourceUpdatedAt', 'Source Last Update', 'DATE_TIME'),
];

const relation = (
  objectName: string,
  name: string,
  label: string,
  targetObjectName: string,
  targetFieldLabel: string,
): FieldDefinition =>
  field(objectName, name, label, 'RELATION', {
    relation: {
      targetObjectName,
      targetFieldLabel,
      targetFieldIcon: 'IconLink',
      type: 'MANY_TO_ONE',
    },
  });

export const buildMigrationSchema = (
  tags: readonly SourceTag[],
): MigrationSchema => {
  const values = new Set<string>();
  const sortedTags = [...tags].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const tagOptions = sortedTags.map((tag, position) => {
    const value = tagValue(tag.name);

    if (!value || values.has(value)) {
      throw new Error(
        `Fetch tag option collision for "${tag.name}" (${value})`,
      );
    }
    values.add(value);

    return {
      id: deterministicId('tag-option', tag.id),
      value,
      label: tag.name,
      position,
      color: ['blue', 'green', 'orange', 'purple', 'sky'][position % 5],
    };
  });
  const objects = [
    object(
      'wholesaler',
      'wholesalers',
      'Wholesaler',
      'Wholesalers',
      'IconUsers',
    ),
    object(
      'salesTeam',
      'salesTeams',
      'Sales Team',
      'Sales Teams',
      'IconUsersGroup',
    ),
    object(
      'teamMembership',
      'teamMemberships',
      'Team Membership',
      'Team Memberships',
      'IconUserCheck',
    ),
    object(
      'leadAssignment',
      'leadAssignments',
      'Lead Assignment',
      'Lead Assignments',
      'IconUserShare',
    ),
    object(
      'outreachActivity',
      'outreachActivities',
      'Outreach Activity',
      'Outreach Activities',
      'IconPhoneCall',
    ),
    object(
      'sourceRecord',
      'sourceRecords',
      'Source Record',
      'Source Records',
      'IconDatabase',
    ),
    object(
      'holdingObservation',
      'holdingObservations',
      'Holding Observation',
      'Holding Observations',
      'IconChartPie',
    ),
    object(
      'importBatch',
      'importBatches',
      'Import Batch',
      'Import Batches',
      'IconFileImport',
    ),
    object(
      'importReviewItem',
      'importReviewItems',
      'Import Review Item',
      'Import Review Items',
      'IconChecklist',
    ),
    object(
      'archivedOutreachActivity',
      'archivedOutreachActivities',
      'Archived Outreach Activity',
      'Archived Outreach Activities',
      'IconArchive',
    ),
  ];
  const everyObject = [
    'company',
    'person',
    'task',
    'taskTarget',
    ...objects.map(({ nameSingular }) => nameSingular),
  ];
  const fields = everyObject.flatMap(provenanceFields);

  fields.push(
    field('company', 'normalizedName', 'Normalized Name'),
    field('company', 'geography', 'Geography'),
    field('company', 'country', 'Source Country'),
    field('company', 'firmType', 'Firm Type'),
    field('company', 'fetchDescription', 'Fetch Description'),
    field('company', 'fetchNotes', 'Fetch Notes'),
    field('company', 'fetchStatus', 'Fetch Status'),
    field('company', 'legacyOwnerId', 'Legacy Owner ID'),
    relation(
      'company',
      'historicalOwner',
      'Historical Owner',
      'wholesaler',
      'Companies',
    ),
    field('company', 'ownedAt', 'Owned At', 'DATE_TIME'),
    field('company', 'amountAskedFor', 'Amount Asked For', 'NUMBER'),
    field('company', 'legacyWebsite', 'Legacy Website'),
    field('company', 'locationPrecision', 'Location Precision'),
    field('company', 'locationSource', 'Location Source'),
    field('company', 'locationIsManual', 'Location Is Manual', 'BOOLEAN'),
    field('company', 'fetchTags', 'Fetch Tags', 'MULTI_SELECT', {
      options: tagOptions,
    }),
    field('person', 'legacyEmail', 'Legacy Email'),
    field('person', 'legacyPrimaryPhone', 'Legacy Primary Phone'),
    field('person', 'legacyLinkedInUrl', 'Legacy LinkedIn URL'),
    field('person', 'legacySecondaryEmails', 'Legacy Secondary Emails'),
    field('person', 'legacySecondaryPhones', 'Legacy Secondary Phones'),
    field('person', 'legacyAddress', 'Legacy Address'),
    field('person', 'legacyCity', 'Legacy City'),
    field('person', 'legacyStateRegion', 'Legacy State / Region'),
    field('person', 'legacyPostalCode', 'Legacy Postal Code'),
    field('person', 'fetchNotes', 'Fetch Notes'),
    field('person', 'fetchMetadata', 'Fetch Metadata'),
    field('person', 'isPrimaryContact', 'Primary Contact', 'BOOLEAN'),
    field('task', 'legacyCompanyId', 'Legacy Company ID'),
    field('task', 'legacyContactId', 'Legacy Contact ID'),
    field('task', 'legacyWholesalerId', 'Legacy Wholesaler ID'),
    field('wholesaler', 'email', 'Email', 'TEXT', { isUnique: true }),
    field('wholesaler', 'fetchRole', 'Fetch Role'),
    field('wholesaler', 'disabledAt', 'Disabled At', 'DATE_TIME'),
    field('wholesaler', 'color', 'Color'),
    field('salesTeam', 'description', 'Description'),
    field('teamMembership', 'membershipRole', 'Membership Role'),
    relation(
      'teamMembership',
      'salesTeam',
      'Sales Team',
      'salesTeam',
      'Memberships',
    ),
    relation(
      'teamMembership',
      'wholesaler',
      'Wholesaler',
      'wholesaler',
      'Team Memberships',
    ),
    field('leadAssignment', 'assignmentDate', 'Assignment Date', 'DATE'),
    field('leadAssignment', 'geography', 'Geography'),
    field('leadAssignment', 'assignmentStatus', 'Assignment Status'),
    field(
      'leadAssignment',
      'replacementOfLegacyId',
      'Replacement Of Legacy ID',
    ),
    field('leadAssignment', 'notes', 'Notes'),
    field('leadAssignment', 'assignedAt', 'Assigned At', 'DATE_TIME'),
    field('leadAssignment', 'completedAt', 'Completed At', 'DATE_TIME'),
    field('leadAssignment', 'returnedAt', 'Returned At', 'DATE_TIME'),
    field('leadAssignment', 'workflowState', 'Workflow State'),
    field('leadAssignment', 'finalOutcome', 'Final Outcome'),
    relation(
      'leadAssignment',
      'company',
      'Company',
      'company',
      'Lead Assignments',
    ),
    relation(
      'leadAssignment',
      'contact',
      'Contact',
      'person',
      'Lead Assignments',
    ),
    relation(
      'leadAssignment',
      'wholesaler',
      'Wholesaler',
      'wholesaler',
      'Lead Assignments',
    ),
    field('outreachActivity', 'activityType', 'Activity Type'),
    field('outreachActivity', 'outcome', 'Outcome'),
    field('outreachActivity', 'notes', 'Notes'),
    field('outreachActivity', 'occurredAt', 'Occurred At', 'DATE_TIME'),
    field('outreachActivity', 'fetchMetadata', 'Fetch Metadata'),
    relation(
      'outreachActivity',
      'company',
      'Company',
      'company',
      'Outreach Activities',
    ),
    relation(
      'outreachActivity',
      'contact',
      'Contact',
      'person',
      'Outreach Activities',
    ),
    relation(
      'outreachActivity',
      'wholesaler',
      'Wholesaler',
      'wholesaler',
      'Outreach Activities',
    ),
    relation(
      'outreachActivity',
      'assignment',
      'Assignment',
      'leadAssignment',
      'Outreach Activities',
    ),
    field('sourceRecord', 'importBatchLegacyId', 'Import Batch Legacy ID'),
    field('sourceRecord', 'sourceFile', 'Source File'),
    field('sourceRecord', 'sourceSheet', 'Source Sheet'),
    field('sourceRecord', 'sourceRow', 'Source Row', 'NUMBER'),
    field('sourceRecord', 'sourceType', 'Source Type'),
    field('sourceRecord', 'sourceLabel', 'Source Label'),
    field('sourceRecord', 'rawData', 'Raw Data'),
    relation('sourceRecord', 'company', 'Company', 'company', 'Source Records'),
    field(
      'holdingObservation',
      'importBatchLegacyId',
      'Import Batch Legacy ID',
    ),
    field('holdingObservation', 'sourceFile', 'Source File'),
    field('holdingObservation', 'sourceRow', 'Source Row', 'NUMBER'),
    field('holdingObservation', 'productName', 'Product Name'),
    field('holdingObservation', 'filerName', 'Filer Name'),
    field('holdingObservation', 'filerId', 'Filer ID'),
    field('holdingObservation', 'cik', 'CIK'),
    field('holdingObservation', 'crd', 'CRD'),
    field('holdingObservation', 'city', 'City'),
    field('holdingObservation', 'stateRegion', 'State / Region'),
    field('holdingObservation', 'sharesHeld', 'Shares Held', 'NUMBER'),
    field('holdingObservation', 'marketValue', 'Market Value', 'NUMBER'),
    field(
      'holdingObservation',
      'portfolioPercent',
      'Portfolio Percent',
      'NUMBER',
    ),
    field('holdingObservation', 'sourceDate', 'Source Date', 'DATE'),
    field('holdingObservation', 'rawData', 'Raw Data'),
    relation(
      'holdingObservation',
      'company',
      'Company',
      'company',
      'Holding Observations',
    ),
    field('importBatch', 'fileName', 'File Name'),
    field('importBatch', 'importStatus', 'Import Status'),
    field('importBatch', 'uploadedByLegacyId', 'Uploaded By Legacy ID'),
    field('importBatch', 'rowCount', 'Row Count', 'NUMBER'),
    field(
      'importBatch',
      'createdCompanyCount',
      'Created Company Count',
      'NUMBER',
    ),
    field(
      'importBatch',
      'mergedCompanyCount',
      'Merged Company Count',
      'NUMBER',
    ),
    field(
      'importBatch',
      'createdContactCount',
      'Created Contact Count',
      'NUMBER',
    ),
    field('importBatch', 'reviewCount', 'Review Count', 'NUMBER'),
    field('importBatch', 'errorCount', 'Error Count', 'NUMBER'),
    field('importBatch', 'previewData', 'Preview Data'),
    field('importBatch', 'committedAt', 'Committed At', 'DATE_TIME'),
    field('importReviewItem', 'sourceFile', 'Source File'),
    field('importReviewItem', 'sourceSheet', 'Source Sheet'),
    field('importReviewItem', 'sourceRow', 'Source Row', 'NUMBER'),
    field('importReviewItem', 'reason', 'Reason'),
    field(
      'importReviewItem',
      'legacyCandidateCompanyId',
      'Legacy Candidate Company ID',
    ),
    field('importReviewItem', 'rawData', 'Raw Data'),
    field('importReviewItem', 'reviewStatus', 'Review Status'),
    field('importReviewItem', 'reviewedByLegacyId', 'Reviewed By Legacy ID'),
    field('importReviewItem', 'reviewedAt', 'Reviewed At', 'DATE_TIME'),
    relation(
      'importReviewItem',
      'importBatch',
      'Import Batch',
      'importBatch',
      'Review Items',
    ),
    relation(
      'importReviewItem',
      'candidateCompany',
      'Candidate Company',
      'company',
      'Import Review Items',
    ),
    field('archivedOutreachActivity', 'activityType', 'Activity Type'),
    field('archivedOutreachActivity', 'outcome', 'Outcome'),
    field('archivedOutreachActivity', 'notes', 'Notes'),
    field('archivedOutreachActivity', 'occurredAt', 'Occurred At', 'DATE_TIME'),
    field('archivedOutreachActivity', 'fetchMetadata', 'Fetch Metadata'),
    field(
      'archivedOutreachActivity',
      'legacyCanonicalActivityId',
      'Legacy Canonical Activity ID',
    ),
    field('archivedOutreachActivity', 'archiveReason', 'Archive Reason'),
    field('archivedOutreachActivity', 'archivedAt', 'Archived At', 'DATE_TIME'),
    relation(
      'archivedOutreachActivity',
      'company',
      'Company',
      'company',
      'Archived Outreach Activities',
    ),
    relation(
      'archivedOutreachActivity',
      'contact',
      'Contact',
      'person',
      'Archived Outreach Activities',
    ),
    relation(
      'archivedOutreachActivity',
      'wholesaler',
      'Wholesaler',
      'wholesaler',
      'Archived Outreach Activities',
    ),
    relation(
      'archivedOutreachActivity',
      'assignment',
      'Assignment',
      'leadAssignment',
      'Archived Outreach Activities',
    ),
    relation(
      'archivedOutreachActivity',
      'canonicalActivity',
      'Canonical Activity',
      'outreachActivity',
      'Archived Duplicates',
    ),
  );

  return { objects, fields };
};

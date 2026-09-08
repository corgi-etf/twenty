import { deterministicId } from './deterministic-id.ts';
import { sourceRowHmac } from './integrity.ts';

export type SourceCompany = {
  id: string;
  name: string;
  normalized_name?: string | null;
  website?: string | null;
  geography?: string | null;
  country?: string | null;
  city?: string | null;
  state_region?: string | null;
  firm_type?: string | null;
  description?: string | null;
  notes?: string | null;
  status?: string | null;
  owned_by_user_id?: string | null;
  owned_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  amount_asked_for?: number | null;
};

export type SourceContact = {
  id: string;
  company_id: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  secondary_emails?: unknown;
  phone?: string | null;
  secondary_phones?: unknown;
  linkedin?: unknown;
  address?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  metadata?: unknown;
  is_primary?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SourceRow = {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SourceCompanyLocation = {
  company_id: string;
  latitude?: number | null;
  longitude?: number | null;
  precision?: string | null;
  country_code?: string | null;
  region_code?: string | null;
  formatted_address?: string | null;
  source?: string | null;
  is_manual?: boolean | null;
  needs_refresh?: boolean | null;
  geocoded_at?: string | null;
  updated_at?: string | null;
};

export type SourceUser = Omit<SourceRow, 'id'> & {
  id?: string;
  auth_user_id?: string;
  name?: string | null;
  email: string;
  role?: string | null;
  disabled_at?: string | null;
  disabled_email?: string | null;
  color?: string | null;
};
export type SourceAuthUser = {
  id: string;
  name?: string | null;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SourceTeam = SourceRow & {
  name: string;
  description?: string | null;
};
export type SourceTeamMembership = SourceRow & {
  team_id: string;
  user_id: string;
  role?: string | null;
};
export type SourceAssignment = SourceRow & {
  company_id: string;
  contact_id?: string | null;
  user_id: string;
  assignment_date?: string | null;
  geography?: string | null;
  status?: string | null;
  replacement_of?: string | null;
  notes?: string | null;
  assigned_at?: string | null;
  completed_at?: string | null;
  returned_at?: string | null;
  workflow_state?: string | null;
  final_outcome?: string | null;
};
export type SourceActivity = SourceRow & {
  company_id: string;
  contact_id?: string | null;
  user_id: string;
  assignment_id?: string | null;
  activity_type?: string | null;
  outcome?: string | null;
  notes?: string | null;
  occurred_at?: string | null;
  metadata?: unknown;
};
export type SourceFollowUp = SourceRow & {
  company_id: string;
  contact_id?: string | null;
  user_id: string;
  due_date?: string | null;
  status?: string | null;
  notes?: string | null;
};
export type SourceCompanyRecord = SourceRow & {
  company_id: string;
  import_batch_id?: string | null;
  source_file?: string | null;
  source_sheet?: string | null;
  source_row?: number | null;
  source_type?: string | null;
  source_label?: string | null;
  raw_data?: unknown;
};
export type SourceHoldingObservation = SourceRow & {
  company_id: string;
  import_batch_id?: string | null;
  source_file?: string | null;
  source_row?: number | null;
  product_name?: string | null;
  filer_name?: string | null;
  filer_id?: string | null;
  cik?: string | null;
  crd?: string | null;
  city?: string | null;
  state_region?: string | null;
  shares_held?: number | null;
  market_value?: number | null;
  portfolio_percent?: number | null;
  source_date?: string | null;
  raw_data?: unknown;
};
export type SourceTag = SourceRow & { name: string };
export type SourceCompanyTag = { company_id: string; tag_id: string };
export type SourceImportBatch = SourceRow & {
  file_name?: string | null;
  status?: string | null;
  uploaded_by?: string | null;
  row_count?: number | null;
  created_company_count?: number | null;
  merged_company_count?: number | null;
  created_contact_count?: number | null;
  review_count?: number | null;
  error_count?: number | null;
  preview_data?: unknown;
  committed_at?: string | null;
};
export type SourceImportReviewItem = SourceRow & {
  import_batch_id: string;
  source_file?: string | null;
  source_sheet?: string | null;
  source_row?: number | null;
  reason?: string | null;
  candidate_company_id?: string | null;
  raw_data?: unknown;
  status?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};
export type SourceArchivedActivity = SourceRow & {
  company_id: string;
  contact_id?: string | null;
  user_id: string;
  assignment_id?: string | null;
  activity_type?: string | null;
  outcome?: string | null;
  notes?: string | null;
  occurred_at?: string | null;
  metadata?: unknown;
  canonical_activity_id?: string | null;
  archive_reason?: string | null;
  archived_at?: string | null;
};

export type MinimalSnapshot = {
  companies: SourceCompany[];
  contacts: SourceContact[];
  companyLocations?: SourceCompanyLocation[];
  users?: SourceUser[];
  authUsers?: SourceAuthUser[];
  teams?: SourceTeam[];
  teamMemberships?: SourceTeamMembership[];
  assignments?: SourceAssignment[];
  activities?: SourceActivity[];
  followUps?: SourceFollowUp[];
  companySources?: SourceCompanyRecord[];
  holdingObservations?: SourceHoldingObservation[];
  tags?: SourceTag[];
  companyTags?: SourceCompanyTag[];
  importBatches?: SourceImportBatch[];
  importReviewItems?: SourceImportReviewItem[];
  archivedActivities?: SourceArchivedActivity[];
};

export type PlannedRecord = {
  objectPlural: string;
  sourceId: string;
  targetId: string;
  payload: Record<string, unknown>;
};

export type MigrationWarning = {
  code: string;
  sourceIds: string[];
};

export type MinimalPlan = {
  records: PlannedRecord[];
  warnings: MigrationWarning[];
  invitationPlan: Array<{
    email: string;
    name: string;
    requestedRole: string;
    sourceUserId: string;
  }>;
};

const sortById = <T extends { id: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((left, right) => left.id.localeCompare(right.id));

const jsonText = (value: unknown): string | null =>
  value === undefined || value === null ? null : JSON.stringify(value);

const legacyText = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() ? value : null;

  return JSON.stringify(value) ?? String(value);
};

const normalizeAbsoluteHttpUrl = (rawUrl: unknown): string | null => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;

  const trimmedUrl = rawUrl.trim();
  const candidate = /^(?:www\.)?linkedin\.com(?:[/?#]|$)/i.test(trimmedUrl)
    ? `https://${trimmedUrl}`
    : trimmedUrl;

  try {
    const parsedUrl = new URL(candidate);

    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      !parsedUrl.hostname ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return null;
    }

    return parsedUrl.href;
  } catch {
    return null;
  }
};

const normalizeUsPhone = (
  rawPhone: string,
): {
  primaryPhoneNumber: string;
  primaryPhoneCountryCode: 'US';
  primaryPhoneCallingCode: '+1';
  additionalPhones: [];
} | null => {
  const withoutExtension = rawPhone
    .trim()
    .replace(/[\s,;]*(?:(?:ext(?:ension)?\.?|x|#)\s*\d+)\s*$/i, '');

  if (!/^[+()\d.\s-]+$/.test(withoutExtension)) return null;

  const compactPhone = withoutExtension.replace(/[().\s-]/g, '');
  const nationalNumber = compactPhone.startsWith('+1')
    ? compactPhone.slice(2)
    : compactPhone.length === 11 && compactPhone.startsWith('1')
      ? compactPhone.slice(1)
      : compactPhone;

  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(nationalNumber)) return null;

  return {
    primaryPhoneNumber: nationalNumber,
    primaryPhoneCountryCode: 'US',
    primaryPhoneCallingCode: '+1',
    additionalPhones: [],
  };
};

const tagValue = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const provenance = (
  row: SourceRow | Record<string, unknown>,
  kind: string,
  sourceId: string,
  migrationRunId: string,
  hmacKey: string,
  sourceProjection: unknown = row,
) => ({
  id: deterministicId(kind, sourceId),
  legacyFetchId: sourceId,
  migrationRunId,
  sourceRowHmac: sourceRowHmac(sourceProjection, hmacKey),
  ...('created_at' in row ? { sourceCreatedAt: row.created_at ?? null } : {}),
  ...('updated_at' in row ? { sourceUpdatedAt: row.updated_at ?? null } : {}),
});

const asRecord = (
  objectPlural: string,
  sourceId: string,
  payload: Record<string, unknown>,
): PlannedRecord => ({
  objectPlural,
  sourceId,
  targetId: payload.id as string,
  payload,
});

export const buildPlan = (
  snapshot: MinimalSnapshot,
  options: { migrationRunId: string; hmacKey: string },
): MinimalPlan => {
  const companies = sortById(snapshot.companies);
  const contacts = sortById(snapshot.contacts);
  const warnings: MigrationWarning[] = [];

  const recordCollisions = (
    code: string,
    rows: readonly { id: string }[],
    key: (row: (typeof rows)[number]) => string,
  ) => {
    const groups = new Map<string, string[]>();

    for (const row of rows) {
      const value = key(row).trim().toLowerCase();

      if (value === '') continue;
      groups.set(value, [...(groups.get(value) ?? []), row.id]);
    }

    for (const ids of groups.values()) {
      if (ids.length > 1) {
        warnings.push({ code, sourceIds: [...ids].sort() });
      }
    }
  };

  recordCollisions(
    'COMPANY_NAME_COLLISION',
    companies,
    (row) => (row as SourceCompany).normalized_name ?? '',
  );

  const normalizeDomain = (website: string | null | undefined) => {
    if (!website?.trim()) return '';

    try {
      return new URL(
        website.includes('://') ? website : `https://${website}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch {
      return '';
    }
  };
  recordCollisions('COMPANY_DOMAIN_COLLISION', companies, (row) =>
    normalizeDomain((row as SourceCompany).website),
  );
  recordCollisions(
    'PERSON_EMAIL_COLLISION',
    contacts,
    (row) => (row as SourceContact).email ?? '',
  );

  const canonicalIdByValue = <T extends { id: string }>(
    rows: readonly T[],
    key: (row: T) => string,
  ) => {
    const result = new Map<string, string>();

    for (const row of rows) {
      const value = key(row).trim().toLowerCase();

      if (value && !result.has(value)) result.set(value, row.id);
    }

    return result;
  };
  const domainHolder = canonicalIdByValue(companies, (row) =>
    normalizeDomain(row.website),
  );
  const contactRichness = (row: SourceContact) =>
    [
      row.first_name,
      row.last_name,
      row.title,
      row.phone,
      row.linkedin,
      row.address,
      row.city,
      row.state_region,
      row.postal_code,
      row.notes,
    ].filter((value) => typeof value === 'string' && value.trim() !== '')
      .length;
  const contactsByCanonicalPriority = [...contacts].sort(
    (left, right) =>
      Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)) ||
      contactRichness(right) - contactRichness(left) ||
      left.id.localeCompare(right.id),
  );
  const emailHolder = canonicalIdByValue(
    contactsByCanonicalPriority,
    (row) => row.email?.trim().toLowerCase() ?? '',
  );

  const companyRecords: PlannedRecord[] = companies.map((row) => {
    const domain = normalizeDomain(row.website);
    const location = snapshot.companyLocations?.find(
      ({ company_id }) => company_id === row.id,
    );
    const companyTagNames = (snapshot.companyTags ?? [])
      .filter(({ company_id }) => company_id === row.id)
      .map(({ tag_id }) => snapshot.tags?.find(({ id }) => id === tag_id)?.name)
      .filter((name): name is string => Boolean(name))
      .map(tagValue)
      .sort();
    const payload: Record<string, unknown> = {
      ...provenance(
        row,
        'company',
        row.id,
        options.migrationRunId,
        options.hmacKey,
        {
          company: row,
          location: location ?? null,
          tags: companyTagNames,
        },
      ),
      name: row.name,
      normalizedName: row.normalized_name ?? null,
      geography: row.geography ?? null,
      country: row.country ?? null,
      firmType: row.firm_type ?? null,
      fetchDescription: row.description ?? null,
      fetchNotes: row.notes ?? null,
      fetchStatus: row.status ?? null,
      legacyOwnerId: row.owned_by_user_id ?? null,
      historicalOwnerId: row.owned_by_user_id
        ? deterministicId('wholesaler', row.owned_by_user_id)
        : null,
      ownedAt: row.owned_at ?? null,
      amountAskedFor: row.amount_asked_for ?? null,
      legacyWebsite: row.website ?? null,
      fetchTags: companyTagNames,
      locationPrecision: location?.precision ?? null,
      locationSource: location?.source ?? null,
      locationIsManual: location?.is_manual ?? null,
    };

    if (location) {
      payload.address = {
        addressStreet1: location.formatted_address ?? '',
        addressStreet2: '',
        addressCity: row.city ?? '',
        addressState: row.state_region ?? '',
        addressPostcode: '',
        addressCountry: row.country ?? '',
        addressLat: location.latitude ?? null,
        addressLng: location.longitude ?? null,
      };
    }

    if (domain && domainHolder.get(domain) === row.id) {
      payload.domainName = {
        primaryLinkLabel: domain,
        primaryLinkUrl: `https://${domain}`,
        secondaryLinks: [],
      };
    }

    return {
      ...asRecord('companies', row.id, payload),
    };
  });
  const peopleRecords: PlannedRecord[] = contacts.map((row) => {
    const email = row.email?.trim().toLowerCase() ?? '';
    const payload: Record<string, unknown> = {
      ...provenance(
        row,
        'person',
        row.id,
        options.migrationRunId,
        options.hmacKey,
      ),
      name: {
        firstName: row.first_name ?? '',
        lastName: row.last_name ?? '',
      },
      companyId: deterministicId('company', row.company_id),
      legacyEmail: email || null,
      jobTitle: row.title ?? null,
      legacyPrimaryPhone: row.phone?.trim() ? row.phone : null,
      legacyLinkedInUrl: legacyText(row.linkedin),
      legacySecondaryEmails: jsonText(row.secondary_emails),
      legacySecondaryPhones: jsonText(row.secondary_phones),
      legacyAddress: row.address ?? null,
      legacyCity: row.city ?? null,
      legacyStateRegion: row.state_region ?? null,
      legacyPostalCode: row.postal_code ?? null,
      fetchNotes: row.notes ?? null,
      fetchMetadata: jsonText(row.metadata),
      isPrimaryContact: row.is_primary ?? null,
    };

    if (email && emailHolder.get(email) === row.id) {
      payload.emails = { primaryEmail: email, additionalEmails: [] };
    }
    const normalizedPhone = row.phone ? normalizeUsPhone(row.phone) : null;

    if (normalizedPhone) payload.phones = normalizedPhone;
    const normalizedLinkedInUrl = normalizeAbsoluteHttpUrl(row.linkedin);

    if (normalizedLinkedInUrl) {
      payload.linkedinLink = {
        primaryLinkLabel: 'LinkedIn',
        primaryLinkUrl: normalizedLinkedInUrl,
        secondaryLinks: [],
      };
    }

    return asRecord('people', row.id, payload);
  });

  const customRecord = <T extends SourceRow>(
    objectPlural: string,
    kind: string,
    row: T,
    payload: Record<string, unknown>,
  ) =>
    asRecord(objectPlural, row.id, {
      ...provenance(row, kind, row.id, options.migrationRunId, options.hmacKey),
      ...payload,
    });

  const userId = (row: SourceUser) => row.auth_user_id ?? row.id;
  const sortedUsers = [...(snapshot.users ?? [])].sort((left, right) =>
    (userId(left) ?? '').localeCompare(userId(right) ?? ''),
  );
  for (const row of sortedUsers) {
    if (!userId(row)) throw new Error('A Fetch user is missing its source ID');
  }
  const authUsers = sortById(snapshot.authUsers ?? []);
  const authUserById = new Map(authUsers.map((row) => [row.id, row]));
  const roleByAuthUserId = new Map(
    sortedUsers.map((row) => [userId(row)!, row]),
  );
  if (snapshot.authUsers) {
    for (const row of sortedUsers) {
      if (!authUserById.has(userId(row)!)) {
        warnings.push({
          code: 'ROLE_WITHOUT_AUTH_USER',
          sourceIds: [userId(row)!],
        });
      }
    }
    for (const row of authUsers) {
      if (!roleByAuthUserId.has(row.id)) {
        warnings.push({ code: 'AUTH_USER_WITHOUT_ROLE', sourceIds: [row.id] });
      }
    }
  }
  const wholesalers = sortedUsers.map((row) =>
    customRecord(
      'wholesalers',
      'wholesaler',
      { ...row, id: userId(row)! },
      {
        name: row.name ?? row.email,
        email: row.email.toLowerCase(),
        fetchRole: row.role ?? null,
        disabledAt: row.disabled_at ?? null,
        color: row.color ?? null,
      },
    ),
  );
  const salesTeams = sortById(snapshot.teams ?? []).map((row) =>
    customRecord('salesTeams', 'salesTeam', row, {
      name: row.name,
      description: row.description ?? null,
    }),
  );
  const teamMemberships = sortById(snapshot.teamMemberships ?? []).map((row) =>
    customRecord('teamMemberships', 'teamMembership', row, {
      name: `Membership ${row.id}`,
      salesTeamId: deterministicId('salesTeam', row.team_id),
      wholesalerId: deterministicId('wholesaler', row.user_id),
      membershipRole: row.role ?? null,
    }),
  );
  const leadAssignments = sortById(snapshot.assignments ?? []).map((row) =>
    customRecord('leadAssignments', 'leadAssignment', row, {
      name: `Assignment ${row.assignment_date ?? row.id}`,
      companyId: deterministicId('company', row.company_id),
      contactId: row.contact_id
        ? deterministicId('person', row.contact_id)
        : null,
      wholesalerId: deterministicId('wholesaler', row.user_id),
      assignmentDate: row.assignment_date ?? null,
      geography: row.geography ?? null,
      assignmentStatus: row.status ?? null,
      replacementOfLegacyId: row.replacement_of ?? null,
      notes: row.notes ?? null,
      assignedAt: row.assigned_at ?? null,
      completedAt: row.completed_at ?? null,
      returnedAt: row.returned_at ?? null,
      workflowState: row.workflow_state ?? null,
      finalOutcome: row.final_outcome ?? null,
    }),
  );
  const outreachActivities = sortById(snapshot.activities ?? []).map((row) =>
    customRecord('outreachActivities', 'outreachActivity', row, {
      name: `${row.activity_type ?? 'Activity'} ${row.occurred_at ?? row.id}`,
      companyId: deterministicId('company', row.company_id),
      contactId: row.contact_id
        ? deterministicId('person', row.contact_id)
        : null,
      wholesalerId: deterministicId('wholesaler', row.user_id),
      assignmentId: row.assignment_id
        ? deterministicId('leadAssignment', row.assignment_id)
        : null,
      activityType: row.activity_type ?? null,
      outcome: row.outcome ?? null,
      notes: row.notes ?? null,
      occurredAt: row.occurred_at ?? null,
      fetchMetadata: jsonText(row.metadata),
    }),
  );
  const tasks = sortById(snapshot.followUps ?? []).map((row) =>
    customRecord('tasks', 'task', row, {
      title: row.notes?.trim() || `Follow up ${row.due_date ?? row.id}`,
      bodyV2: { blocknote: null, markdown: row.notes ?? '' },
      dueAt:
        row.due_date && /^\d{4}-\d{2}-\d{2}$/.test(row.due_date)
          ? new Date(`${row.due_date}T00:00:00.000Z`).toISOString()
          : (row.due_date ?? null),
      status: row.status === 'completed' ? 'DONE' : 'TODO',
      legacyCompanyId: row.company_id,
      legacyContactId: row.contact_id ?? null,
      legacyWholesalerId: row.user_id,
    }),
  );
  const taskTargets = sortById(snapshot.followUps ?? []).map((row) => {
    const sourceId = `followup:${row.id}:company`;
    const targetPayload = {
      ...provenance(
        row,
        'taskTarget',
        sourceId,
        options.migrationRunId,
        options.hmacKey,
      ),
      taskId: deterministicId('task', row.id),
      targetCompanyId: deterministicId('company', row.company_id),
    };

    return asRecord('taskTargets', sourceId, targetPayload);
  });
  const sourceRecords = sortById(snapshot.companySources ?? []).map((row) =>
    customRecord('sourceRecords', 'sourceRecord', row, {
      name: `${row.source_label ?? row.source_file ?? 'Source'} ${row.source_row ?? ''}`.trim(),
      companyId: deterministicId('company', row.company_id),
      importBatchLegacyId: row.import_batch_id ?? null,
      sourceFile: row.source_file ?? null,
      sourceSheet: row.source_sheet ?? null,
      sourceRow: row.source_row ?? null,
      sourceType: row.source_type ?? null,
      sourceLabel: row.source_label ?? null,
      rawData: jsonText(row.raw_data),
    }),
  );
  const holdingObservations = sortById(snapshot.holdingObservations ?? []).map(
    (row) =>
      customRecord('holdingObservations', 'holdingObservation', row, {
        name: `${row.product_name ?? 'Holding'} - ${row.filer_name ?? row.id}`,
        companyId: deterministicId('company', row.company_id),
        importBatchLegacyId: row.import_batch_id ?? null,
        sourceFile: row.source_file ?? null,
        sourceRow: row.source_row ?? null,
        productName: row.product_name ?? null,
        filerName: row.filer_name ?? null,
        filerId: row.filer_id ?? null,
        cik: row.cik ?? null,
        crd: row.crd ?? null,
        city: row.city ?? null,
        stateRegion: row.state_region ?? null,
        sharesHeld: row.shares_held ?? null,
        marketValue: row.market_value ?? null,
        portfolioPercent: row.portfolio_percent ?? null,
        sourceDate: row.source_date ?? null,
        rawData: jsonText(row.raw_data),
      }),
  );
  const importBatches = sortById(snapshot.importBatches ?? []).map((row) =>
    customRecord('importBatches', 'importBatch', row, {
      name: row.file_name ?? `Import ${row.id}`,
      fileName: row.file_name ?? null,
      importStatus: row.status ?? null,
      uploadedByLegacyId: row.uploaded_by ?? null,
      rowCount: row.row_count ?? null,
      createdCompanyCount: row.created_company_count ?? null,
      mergedCompanyCount: row.merged_company_count ?? null,
      createdContactCount: row.created_contact_count ?? null,
      reviewCount: row.review_count ?? null,
      errorCount: row.error_count ?? null,
      previewData: jsonText(row.preview_data),
      committedAt: row.committed_at ?? null,
    }),
  );
  const companyIds = new Set(companies.map(({ id }) => id));
  const importReviewItems = sortById(snapshot.importReviewItems ?? []).map(
    (row) => {
      const candidateExists = row.candidate_company_id
        ? companyIds.has(row.candidate_company_id)
        : false;

      if (row.candidate_company_id && !candidateExists) {
        warnings.push({
          code: 'REVIEW_CANDIDATE_COMPANY_MISSING',
          sourceIds: [row.id, row.candidate_company_id],
        });
      }

      return customRecord('importReviewItems', 'importReviewItem', row, {
        name: `Review ${row.source_file ?? ''} ${row.source_row ?? row.id}`.trim(),
        importBatchId: deterministicId('importBatch', row.import_batch_id),
        sourceFile: row.source_file ?? null,
        sourceSheet: row.source_sheet ?? null,
        sourceRow: row.source_row ?? null,
        reason: row.reason ?? null,
        legacyCandidateCompanyId: row.candidate_company_id ?? null,
        ...(candidateExists
          ? {
              candidateCompanyId: deterministicId(
                'company',
                row.candidate_company_id!,
              ),
            }
          : {}),
        rawData: jsonText(row.raw_data),
        reviewStatus: row.status ?? null,
        reviewedByLegacyId: row.reviewed_by ?? null,
        reviewedAt: row.reviewed_at ?? null,
      });
    },
  );
  const activityIds = new Set((snapshot.activities ?? []).map(({ id }) => id));
  const archivedOutreachActivities = sortById(
    snapshot.archivedActivities ?? [],
  ).map((row) =>
    customRecord(
      'archivedOutreachActivities',
      'archivedOutreachActivity',
      row,
      {
        name: `Archived ${row.activity_type ?? 'activity'} ${row.occurred_at ?? row.id}`,
        companyId: deterministicId('company', row.company_id),
        contactId: row.contact_id
          ? deterministicId('person', row.contact_id)
          : null,
        wholesalerId: deterministicId('wholesaler', row.user_id),
        assignmentId: row.assignment_id
          ? deterministicId('leadAssignment', row.assignment_id)
          : null,
        activityType: row.activity_type ?? null,
        outcome: row.outcome ?? null,
        notes: row.notes ?? null,
        occurredAt: row.occurred_at ?? null,
        fetchMetadata: jsonText(row.metadata),
        legacyCanonicalActivityId: row.canonical_activity_id ?? null,
        ...(row.canonical_activity_id &&
        activityIds.has(row.canonical_activity_id)
          ? {
              canonicalActivityId: deterministicId(
                'outreachActivity',
                row.canonical_activity_id,
              ),
            }
          : {}),
        archiveReason: row.archive_reason ?? null,
        archivedAt: row.archived_at ?? null,
      },
    ),
  );

  warnings.sort((left, right) =>
    `${left.code}:${left.sourceIds.join(',')}`.localeCompare(
      `${right.code}:${right.sourceIds.join(',')}`,
    ),
  );

  const invitationPlan = snapshot.authUsers
    ? authUsers.flatMap((authUser) => {
        const role = roleByAuthUserId.get(authUser.id);

        return !role || role.disabled_at || authUser.banned
          ? []
          : [
              {
                email: authUser.email.toLowerCase(),
                name: authUser.name ?? role.name ?? authUser.email,
                requestedRole: role.role ?? authUser.role ?? 'member',
                sourceUserId: authUser.id,
              },
            ];
      })
    : sortedUsers
        .filter(({ disabled_at }) => !disabled_at)
        .map((row) => ({
          email: row.email.toLowerCase(),
          name: row.name ?? row.email,
          requestedRole: row.role ?? 'member',
          sourceUserId: userId(row)!,
        }));

  return {
    records: [
      ...wholesalers,
      ...salesTeams,
      ...teamMemberships,
      ...companyRecords,
      ...peopleRecords,
      ...leadAssignments,
      ...outreachActivities,
      ...tasks,
      ...taskTargets,
      ...sourceRecords,
      ...holdingObservations,
      ...importBatches,
      ...importReviewItems,
      ...archivedOutreachActivities,
    ],
    warnings,
    invitationPlan,
  };
};

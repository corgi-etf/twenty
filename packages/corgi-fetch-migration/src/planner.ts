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
  linkedin?: string | null;
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

export type MinimalSnapshot = {
  companies: SourceCompany[];
  contacts: SourceContact[];
  companyLocations?: SourceCompanyLocation[];
  users?: SourceUser[];
  teams?: SourceTeam[];
  teamMemberships?: SourceTeamMembership[];
  assignments?: SourceAssignment[];
  activities?: SourceActivity[];
  followUps?: SourceFollowUp[];
  companySources?: SourceCompanyRecord[];
  holdingObservations?: SourceHoldingObservation[];
  tags?: SourceTag[];
  companyTags?: SourceCompanyTag[];
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
) => ({
  id: deterministicId(kind, sourceId),
  legacyFetchId: sourceId,
  migrationRunId,
  sourceRowHmac: sourceRowHmac(row, hmacKey),
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
  const emailHolder = canonicalIdByValue(
    contacts,
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
    if (row.phone?.trim()) {
      payload.phones = {
        primaryPhoneNumber: row.phone.trim(),
        primaryPhoneCountryCode: row.phone.trim().startsWith('+1') ? 'US' : '',
        primaryPhoneCallingCode: row.phone.trim().startsWith('+1') ? '+1' : '',
        additionalPhones: [],
      };
    }
    if (row.linkedin?.trim()) {
      payload.linkedinLink = {
        primaryLinkLabel: 'LinkedIn',
        primaryLinkUrl: row.linkedin.trim(),
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
      dueAt: row.due_date ?? null,
      status: row.status === 'completed' ? 'DONE' : 'TODO',
      legacyCompanyId: row.company_id,
      legacyContactId: row.contact_id ?? null,
      legacyWholesalerId: row.user_id,
    }),
  );
  const taskTargets = sortById(snapshot.followUps ?? []).map((row) => {
    const sourceId = `followup:${row.id}:company`;
    const targetPayload = {
      id: deterministicId('taskTarget', sourceId),
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

  warnings.sort((left, right) =>
    `${left.code}:${left.sourceIds.join(',')}`.localeCompare(
      `${right.code}:${right.sourceIds.join(',')}`,
    ),
  );

  const invitationPlan = sortedUsers
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
    ],
    warnings,
    invitationPlan,
  };
};
import { deterministicId } from './deterministic-id.ts';
import { sourceRowHmac } from './integrity.ts';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertPlanCanApply,
  buildCanonicalizationPlan,
  type CanonicalizationSnapshot,
  type CrmRecord,
} from '../src/planner.ts';
import {
  assertCanonicalizationComplete,
  assertReconciliationManifest,
  buildReconciliationReport,
  createReconciliationManifest,
} from '../src/reconciliation.ts';

const snapshot = (): CanonicalizationSnapshot => ({
  companies: [
    {
      id: 'company-1',
      name: 'Acme Advisors',
      domainName: {
        primaryLinkLabel: '',
        primaryLinkUrl: '',
        secondaryLinks: [],
      },
      address: {
        addressStreet1: '',
        addressStreet2: '',
        addressCity: '',
        addressState: '',
        addressPostcode: '',
        addressCountry: '',
        addressLat: null,
        addressLng: null,
      },
      legacyWebsite: 'acme.example',
      fetchDescription: 'High confidence: imported listing',
    },
  ],
  people: [
    {
      id: 'person-1',
      legacyFetchId: 'contact-old-1',
      companyId: 'company-1',
      name: { firstName: 'Alex', lastName: 'Smith' },
      emails: { primaryEmail: 'alex@acme.example', additionalEmails: [] },
      phones: {
        primaryPhoneNumber: '',
        primaryPhoneCountryCode: '',
        primaryPhoneCallingCode: '',
        additionalPhones: [],
      },
      linkedinLink: {
        primaryLinkLabel: '',
        primaryLinkUrl: '',
        secondaryLinks: [],
      },
      legacyEmail: 'alex@acme.example',
      legacyPrimaryPhone: '(312) 555-0198 x55',
      legacyLinkedInUrl: 'linkedin.com/in/alex?trk=old',
      legacySecondaryEmails: '["alex.secondary@example.com"]',
      legacySecondaryPhones: '["773-555-0123","call office"]',
    },
  ],
  sourceRecords: [
    {
      id: 'source-1',
      companyId: 'company-1',
      sourceFile: 'leads.csv',
      sourceSheet: 'Leads',
      sourceRow: 1,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'Alex',
        'Last Name': 'Smith',
        'Email 1': 'alex@acme.example',
        'Firm Website': 'https://acme.example/about',
        'Firm AUM': '$1,200,000',
        Bio: 'Advisor bio',
      }),
    },
    {
      id: 'source-company',
      companyId: 'company-1',
      sourceFile: 'firms.csv',
      sourceSheet: null,
      sourceRow: 2,
      rawData: JSON.stringify({
        'Firm Name': 'Acme Advisors',
        Website: 'acme.example',
        'City / HQ': 'Chicago',
        Region: 'Midwest',
        'Notes / Source Confidence': 'High confidence: imported listing',
        'Type of Firm': 'RIA',
      }),
    },
  ],
  importReviewItems: [
    {
      id: 'review-duplicate',
      reviewStatus: 'pending',
      sourceFile: 'leads.csv',
      sourceSheet: 'Leads',
      sourceRow: '001',
      rawData: JSON.stringify({
        bio: 'Advisor bio',
        'firm aum': '$1,200,000',
        'firm website': 'https://acme.example/about',
        'email 1': 'alex@acme.example',
        'last name': 'Smith',
        'first name': 'Alex',
        ria: 'Acme Advisors',
      }),
    },
  ],
  holdingObservations: [
    {
      id: 'holding-1',
      companyId: 'company-1',
      rawData: JSON.stringify({
        'Filer Name': 'Acme Advisors',
        'Shares Held': '1,000',
        'Market Value': '$50,000',
        '% of Portfolio': '2.5%',
        '% Ownership': '1.25%',
        'Avg Price': '$50.00',
        'Change in Shares': '-100',
        'Percent Change': '-9.09%',
        'Prior % of Portfolio': '3.0%',
        'Qtr First Owned': '2024 Q1',
        Ranking: '12',
        'Prior Ranking': '10',
        'Source Date': '2026-06-30',
      }),
    },
  ],
  tasks: [
    {
      id: 'task-1',
      legacyFetchId: 'followup-old-1',
      legacyContactId: 'contact-old-1',
      legacyWholesalerId: 'wholesaler-old-1',
    },
  ],
  taskTargets: [
    { id: 'target-company', taskId: 'task-1', targetCompanyId: 'company-1' },
  ],
  wholesalers: [
    { id: 'wholesaler-1', legacyFetchId: 'wholesaler-old-1', name: 'Taylor' },
  ],
  leadAssignments: [
    { id: 'assignment-1', legacyFetchId: 'assignment-old-1' },
    {
      id: 'assignment-2',
      legacyFetchId: 'assignment-old-2',
      replacementOfLegacyId: 'assignment-old-1',
    },
  ],
  outreachActivities: [
    {
      id: 'activity-1',
      companyId: 'company-1',
      contactId: 'person-1',
      wholesalerId: 'wholesaler-1',
      assignmentId: null,
      activityType: 'call',
      outcome: 'connected',
      notes: 'Spoke with advisor',
      occurredAt: '2026-06-01T12:00:00.000Z',
      fetchMetadata: JSON.stringify({
        followUpId: 'followup-old-1',
        followUpDate: '2026-06-15',
      }),
    },
  ],
  archivedOutreachActivities: [
    {
      id: 'archived-1',
      canonicalActivityId: 'activity-1',
      companyId: 'company-1',
      contactId: 'person-1',
      wholesalerId: 'wholesaler-1',
      assignmentId: null,
      activityType: 'call',
      outcome: 'connected',
      notes: 'Spoke with advisor',
      occurredAt: '2026-06-01T12:00:00.000Z',
    },
  ],
});

const mutationFor = (
  plan: ReturnType<typeof buildCanonicalizationPlan>,
  objectPlural: string,
  id: string,
) =>
  plan.mutations.find(
    (mutation) => mutation.objectPlural === objectPlural && mutation.id === id,
  );

test('promotes business facts, merges native contacts, and backfills relations', () => {
  const plan = buildCanonicalizationPlan(snapshot());

  assertPlanCanApply(plan);
  assert.equal(plan.summary.inputRows, 3);
  assert.equal(plan.summary.semanticRows, 2);
  assert.equal(plan.summary.duplicateRows, 1);

  const company = mutationFor(plan, 'companies', 'company-1');
  assert.equal(company?.data.description, undefined);
  assert.equal(company?.data.assetsUnderManagement, '$1,200,000');
  assert.equal(company?.data.geography, 'Midwest');
  assert.equal(
    (company?.data.domainName as { primaryLinkUrl: string }).primaryLinkUrl,
    'https://acme.example/about',
  );
  assert.equal(
    (company?.data.address as { addressCity: string }).addressCity,
    'Chicago',
  );

  const person = mutationFor(plan, 'people', 'person-1');
  assert.deepEqual(person?.data.emails, {
    primaryEmail: 'alex@acme.example',
    additionalEmails: ['alex.secondary@example.com'],
  });
  assert.deepEqual(person?.data.phones, {
    primaryPhoneNumber: '3125550198',
    primaryPhoneCountryCode: 'US',
    primaryPhoneCallingCode: '+1',
    additionalPhones: [
      { number: '7735550123', countryCode: 'US', callingCode: '+1' },
    ],
  });
  assert.equal(
    (person?.data.linkedinLink as { primaryLinkUrl: string }).primaryLinkUrl,
    'https://linkedin.com/in/alex',
  );
  assert.match(
    String(person?.data.otherContactDetails),
    /Phone extension:.*x55/,
  );
  assert.match(String(person?.data.otherContactDetails), /call office/);
  assert.equal(person?.data.bio, 'Advisor bio');

  const holding = mutationFor(plan, 'holdingObservations', 'holding-1');
  assert.equal(holding?.data.ownershipPercent, 1.25);
  assert.equal(holding?.data.averagePrice, 50);
  assert.equal(holding?.data.shareChange, -100);
  assert.equal(holding?.data.previousRanking, 10);
  assert.equal(holding?.data.asOfDate, '2026-06-30');

  assert.equal(
    mutationFor(plan, 'tasks', 'task-1')?.data.wholesalerId,
    'wholesaler-1',
  );
  assert.ok(
    plan.mutations.some(
      ({ objectPlural, data }) =>
        objectPlural === 'taskTargets' && data.targetPersonId === 'person-1',
    ),
  );
  assert.deepEqual(
    mutationFor(plan, 'outreachActivities', 'activity-1')?.data,
    {
      followUpDate: '2026-06-15',
      followUpTaskId: 'task-1',
    },
  );
});

test('non-numeric holding placeholders are explicitly disposed without blocking cleanup', () => {
  const input = snapshot();
  const holding = input.holdingObservations[0]!;
  const rawData = JSON.parse(String(holding.rawData)) as Record<
    string,
    unknown
  >;
  rawData['% Ownership'] = 'N/A';
  holding.rawData = JSON.stringify(rawData);

  const plan = buildCanonicalizationPlan(input);
  const disposition = plan.dispositions.find(({ key }) => key === 'ownership');

  assert.equal(plan.unresolved.length, 0);
  assert.equal(disposition?.kind, 'ignored');
  assert.match(
    String(disposition?.target),
    /non-numeric source placeholder excluded/,
  );
});

test('planner output is deterministic under unordered input', () => {
  const left = snapshot();
  const right = snapshot();
  right.sourceRecords.reverse();
  right.companies.reverse();
  right.leadAssignments.reverse();

  assert.deepEqual(
    buildCanonicalizationPlan(left),
    buildCanonicalizationPlan(right),
  );
});

test('ambiguous company matches create an isolated deterministic company', () => {
  const input = snapshot();
  input.companies.push({ id: 'company-2', name: 'Acme Advisors' });
  input.importReviewItems = [
    {
      id: 'review-new',
      reviewStatus: 'pending',
      sourceFile: 'new.csv',
      sourceRow: 99,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'New',
        'Last Name': 'Person',
      }),
    },
  ];
  input.sourceRecords = [];

  const plan = buildCanonicalizationPlan(input);

  assert.equal(
    plan.unresolved.some(({ code }) => code === 'AMBIGUOUS_COMPANY'),
    false,
  );
  assertPlanCanApply(plan);
  const created = plan.mutations.find(
    ({ objectPlural, id }) =>
      objectPlural === 'companies' &&
      !input.companies.some((company) => company.id === id),
  );
  assert.equal(created?.data.name, 'Acme Advisors');
  assert.equal(
    buildCanonicalizationPlan(input).mutations.find(
      ({ objectPlural, id }) =>
        objectPlural === 'companies' && id === created?.id,
    )?.id,
    created?.id,
  );
});

test('separate unanchored rows never merge through a weak ambiguous company fingerprint', () => {
  const input = snapshot();
  input.companies.push({ id: 'company-2', name: 'Acme Advisors' });
  input.sourceRecords = [];
  input.importReviewItems = [
    {
      id: 'review-ambiguous-one',
      reviewStatus: 'pending',
      sourceFile: 'firms.csv',
      sourceRow: 20,
      rawData: JSON.stringify({
        'Firm Name': 'Acme Advisors',
        'Firm AUM': '$1,000',
      }),
    },
    {
      id: 'review-ambiguous-two',
      reviewStatus: 'pending',
      sourceFile: 'firms.csv',
      sourceRow: 21,
      rawData: JSON.stringify({
        'Firm Name': 'Acme Advisors',
        'Firm AUM': '$2,000',
      }),
    },
  ];

  const plan = buildCanonicalizationPlan(input);
  const isolatedCompanies = plan.mutations.filter(
    ({ objectPlural, id }) =>
      objectPlural === 'companies' &&
      !input.companies.some((company) => company.id === id),
  );

  assertPlanCanApply(plan);
  assert.equal(isolatedCompanies.length, 2);
  assert.deepEqual(
    isolatedCompanies.map(({ data }) => data.assetsUnderManagement).sort(),
    ['$1,000', '$2,000'],
  );
});

test('ambiguous person identities create an isolated person and retain contacts', () => {
  const input = snapshot();
  input.people.push({
    id: 'person-2',
    companyId: 'company-1',
    name: { firstName: 'Different', lastName: 'Person' },
    emails: { primaryEmail: '', additionalEmails: [] },
    phones: {
      primaryPhoneNumber: '3125550198',
      primaryPhoneCountryCode: 'US',
      primaryPhoneCallingCode: '+1',
      additionalPhones: [],
    },
    linkedinLink: {
      primaryLinkLabel: '',
      primaryLinkUrl: '',
      secondaryLinks: [],
    },
  });
  input.sourceRecords = [
    {
      id: 'source-ambiguous-person',
      companyId: 'company-1',
      sourceFile: 'people.csv',
      sourceRow: 15,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'Casey',
        'Last Name': 'Jones',
        'Email 1': 'alex@acme.example',
        'Mobile Phone': '(312) 555-0198',
      }),
    },
  ];
  input.importReviewItems = [];

  const plan = buildCanonicalizationPlan(input);

  assert.equal(
    plan.unresolved.some(({ code }) => code === 'AMBIGUOUS_PERSON_IDENTITY'),
    false,
  );
  assertPlanCanApply(plan);
  const created = plan.mutations.find(
    ({ objectPlural, id }) =>
      objectPlural === 'people' &&
      !input.people.some((person) => person.id === id),
  );
  assert.deepEqual(created?.data.name, {
    firstName: 'Casey',
    lastName: 'Jones',
  });
  assert.match(String(created?.data.otherContactDetails), /alex@acme\.example/);
  assert.match(String(created?.data.otherContactDetails), /312.*555.*0198/);
});

test('identical source content anchored to different companies remains distinct', () => {
  const input = snapshot();
  input.companies.push({ id: 'company-2', name: 'Second Acme' });
  const rawData = JSON.stringify({
    'Firm Name': 'Shared Trading Name',
    'Firm AUM': '$1,000',
  });
  input.sourceRecords = [
    {
      id: 'source-company-1',
      companyId: 'company-1',
      sourceFile: 'companies.csv',
      sourceRow: 16,
      rawData,
    },
    {
      id: 'source-company-2',
      companyId: 'company-2',
      sourceFile: 'companies.csv',
      sourceRow: 17,
      rawData,
    },
  ];
  input.importReviewItems = [];

  const plan = buildCanonicalizationPlan(input);

  assert.equal(
    plan.unresolved.some(({ code }) => code === 'CONTENT_IDENTITY_COLLISION'),
    false,
  );
  assertPlanCanApply(plan);
  assert.equal(
    mutationFor(plan, 'companies', 'company-1')?.data.assetsUnderManagement,
    '$1,000',
  );
  assert.equal(
    mutationFor(plan, 'companies', 'company-2')?.data.assetsUnderManagement,
    '$1,000',
  );

  const contradictory = snapshot();
  contradictory.companies.push({ id: 'company-2', name: 'Second Acme' });
  contradictory.sourceRecords = [
    {
      id: 'source-contradictory-company',
      companyId: 'company-1',
      candidateCompanyId: 'company-2',
      rawData,
    },
  ];
  contradictory.importReviewItems = [];
  const contradictoryPlan = buildCanonicalizationPlan(contradictory);

  assert.equal(
    contradictoryPlan.unresolved.some(
      ({ code }) => code === 'CONTENT_IDENTITY_COLLISION',
    ),
    true,
  );
  assert.throws(() => assertPlanCanApply(contradictoryPlan), /unresolved/i);
});

test('a fully applied plan produces zero mutations on its second run', () => {
  const input = snapshot();
  const first = buildCanonicalizationPlan(input);
  assertPlanCanApply(first);

  const collectionByPlural: Record<string, CrmRecord[]> = {
    companies: input.companies,
    people: input.people,
    holdingObservations: input.holdingObservations,
    tasks: input.tasks,
    taskTargets: input.taskTargets,
    outreachActivities: input.outreachActivities,
  };
  for (const mutation of first.mutations) {
    const collection = collectionByPlural[mutation.objectPlural];
    assert.ok(collection, `unexpected collection ${mutation.objectPlural}`);
    const existing = collection.find(({ id }) => id === mutation.id);
    if (existing) Object.assign(existing, mutation.data);
    else collection.push({ id: mutation.id, ...mutation.data });
  }

  const second = buildCanonicalizationPlan(input);
  assertPlanCanApply(second);
  assert.deepEqual(second.mutations, []);
  const report = assertCanonicalizationComplete(input);
  assert.equal(report.stagingRows, 3);
  assert.equal(report.coveredRows, 3);
  assert.equal(report.verifiedArchivedActivities, 1);
  assert.match(report.rowCoverageHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.remainingMutationsByObject, {});
});

test('reconciliation report exposes only aggregate evidence and blocks incomplete data', () => {
  const input = snapshot();
  const report = buildReconciliationReport(input);

  assert.ok(report.remainingMutations > 0);
  assert.equal(JSON.stringify(report).includes('alex@acme.example'), false);
  assert.throws(() => assertCanonicalizationComplete(input), /incomplete/i);
});

test('every nonempty raw key has one exact disposition and unknown keys fail closed', () => {
  const input = snapshot();
  const plan = buildCanonicalizationPlan(input);
  const nonemptyKeyCount = [
    ...input.sourceRecords,
    ...input.importReviewItems,
    ...input.holdingObservations,
  ].reduce(
    (total, record) =>
      total +
      Object.values(
        JSON.parse(String(record.rawData)) as Record<string, unknown>,
      ).filter((value) => String(value ?? '').trim() !== '').length,
    0,
  );

  assert.equal(plan.dispositions.length, nonemptyKeyCount);
  assert.equal(
    new Set(plan.dispositions.map(({ rowKey, key }) => `${rowKey}\0${key}`))
      .size,
    plan.dispositions.length,
  );

  input.sourceRecords[0]!.rawData = JSON.stringify({
    ...(JSON.parse(String(input.sourceRecords[0]!.rawData)) as Record<
      string,
      unknown
    >),
    'Unexpected Field': 'must not disappear',
  });
  assert.equal(
    buildCanonicalizationPlan(input).unresolved.some(
      ({ code }) => code === 'UNHANDLED_RAW_FIELD',
    ),
    true,
  );
});

test('native business values are preserved and conflicting staging values fail closed', () => {
  const input = snapshot();
  input.companies[0]!.description = 'User-authored description';
  input.companies[0]!.fetchDescription = 'Different imported description';
  input.holdingObservations[0]!.averagePrice = 999;
  input.outreachActivities[0]!.followUpTaskId = 'different-task';
  input.outreachActivities[0]!.followUpDate = '2026-06-16';

  const plan = buildCanonicalizationPlan(input);
  const report = buildReconciliationReport(input);

  assert.equal(
    plan.unresolved.some(({ code }) => code === 'DESCRIPTION_CONFLICT'),
    true,
  );
  assert.equal(
    plan.unresolved.some(({ code }) => code === 'HOLDING_FIELD_CONFLICT'),
    true,
  );
  assert.equal(
    plan.unresolved.some(({ code }) => code === 'OUTREACH_RELATION_CONFLICT'),
    true,
  );
  assert.equal(
    plan.unresolved.some(({ code }) => code === 'OUTREACH_DATE_CONFLICT'),
    true,
  );
  assert.equal(
    mutationFor(plan, 'companies', 'company-1')?.data.description,
    undefined,
  );
  assert.equal(
    mutationFor(plan, 'holdingObservations', 'holding-1')?.data.averagePrice,
    undefined,
  );
  assert.equal(
    mutationFor(plan, 'outreachActivities', 'activity-1')?.data.followUpTaskId,
    undefined,
  );
  assert.deepEqual(
    report.unresolvedSchemaDiagnostics.filter(
      ({ code }) =>
        code === 'DISPOSITION_VALUE_NOT_PRESERVED' ||
        code === 'HOLDING_FIELD_CONFLICT',
    ),
    [
      {
        code: 'HOLDING_FIELD_CONFLICT',
        normalizedRawKey: null,
        canonicalTarget: null,
        canonicalField: 'averagePrice',
        count: 1,
      },
      {
        code: 'DISPOSITION_VALUE_NOT_PRESERVED',
        normalizedRawKey: 'avg price',
        canonicalTarget: 'holdingObservations.averagePrice',
        canonicalField: null,
        count: 1,
      },
    ],
  );
});

test('strong person identity anchors an otherwise ambiguous company name', () => {
  const input = snapshot();
  input.companies.push({ id: 'company-2', name: 'Acme Advisors' });
  input.sourceRecords = [];
  input.importReviewItems = [
    {
      id: 'review-person-anchor',
      reviewStatus: 'pending',
      sourceFile: 'people.csv',
      sourceRow: 7,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'Alex',
        'Last Name': 'Smith',
        'Email 1': 'alex@acme.example',
      }),
    },
  ];

  const plan = buildCanonicalizationPlan(input);

  assert.equal(
    plan.unresolved.some(({ code }) => code === 'AMBIGUOUS_COMPANY'),
    false,
  );
  assert.equal(
    plan.mutations.some(
      ({ objectPlural, id }) =>
        objectPlural === 'companies' && id === 'company-2',
    ),
    false,
  );
});

test('identical holdings from different products retain distinct identities', () => {
  const input = snapshot();
  const rawData = JSON.stringify({
    'Filer Name': 'Acme Advisors',
    'Shares Held': '100',
    'Market Value': '5000',
    'Source Date': '2026-06-30',
  });
  input.sourceRecords = [];
  input.importReviewItems = [
    {
      id: 'holding-a',
      companyId: 'company-1',
      sourceFile: 'Product A.csv',
      sourceRow: 1,
      rawData,
    },
    {
      id: 'holding-b',
      companyId: 'company-1',
      sourceFile: 'Product B.csv',
      sourceRow: 1,
      rawData,
    },
  ];
  input.holdingObservations = [];

  const holdings = buildCanonicalizationPlan(input).mutations.filter(
    ({ objectPlural }) => objectPlural === 'holdingObservations',
  );

  assert.equal(holdings.length, 2);
  assert.notEqual(holdings[0]?.id, holdings[1]?.id);
});

test('alternate LinkedIn links preserve existing secondary links', () => {
  const input = snapshot();
  input.people[0]!.linkedinLink = {
    primaryLinkLabel: 'LinkedIn',
    primaryLinkUrl: 'https://linkedin.com/in/current',
    secondaryLinks: [{ label: 'Portfolio', url: 'https://example.com/alex' }],
  };

  const person = mutationFor(
    buildCanonicalizationPlan(input),
    'people',
    'person-1',
  );
  const links = person?.data.linkedinLink as {
    primaryLinkUrl: string;
    secondaryLinks: Array<{ label: string; url: string }>;
  };

  assert.equal(links.primaryLinkUrl, 'https://linkedin.com/in/current');
  assert.deepEqual(links.secondaryLinks, [
    { label: 'Portfolio', url: 'https://example.com/alex' },
    { label: 'LinkedIn', url: 'https://linkedin.com/in/alex' },
  ]);
});

test('trusted manifest comparison rejects a changed fresh snapshot', () => {
  const report = buildReconciliationReport(snapshot());
  const manifest = createReconciliationManifest(report);

  assert.doesNotThrow(() => assertReconciliationManifest(report, manifest));
  assert.throws(
    () =>
      assertReconciliationManifest(
        { ...report, businessContentHash: '0'.repeat(64) },
        manifest,
      ),
    /manifest/i,
  );
});

test('phone identity includes calling code for native and staged contacts', () => {
  const input = snapshot();
  input.people.push({
    id: 'person-gb',
    companyId: 'company-1',
    name: { firstName: 'British', lastName: 'Advisor' },
    emails: { primaryEmail: '', additionalEmails: [] },
    phones: {
      primaryPhoneNumber: '2079460958',
      primaryPhoneCountryCode: 'GB',
      primaryPhoneCallingCode: '+44',
      additionalPhones: [],
    },
  });
  input.sourceRecords = [
    {
      id: 'source-us-phone',
      companyId: 'company-1',
      sourceFile: 'people.csv',
      sourceRow: 9,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'American',
        'Last Name': 'Advisor',
        'Mobile Phone': '(207) 946-0958',
      }),
    },
  ];
  input.importReviewItems = [];

  const plan = buildCanonicalizationPlan(input);

  assert.equal(
    plan.unresolved.some(({ code }) => code === 'AMBIGUOUS_PERSON_IDENTITY'),
    false,
  );
  assert.equal(mutationFor(plan, 'people', 'person-gb')?.data.name, undefined);
  assert.equal(
    plan.mutations.some(
      ({ objectPlural, id }) =>
        objectPlural === 'people' && id !== 'person-gb' && id !== 'person-1',
    ),
    true,
  );
});

test('generic person and holding addresses never contaminate Company address', () => {
  const input = snapshot();
  input.sourceRecords = [
    {
      id: 'source-home-address',
      companyId: 'company-1',
      sourceFile: 'people.csv',
      sourceRow: 10,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'Alex',
        'Last Name': 'Smith',
        'Email 1': 'alex@acme.example',
        Address: '1 Home Lane',
        City: 'Evanston',
        State: 'IL',
        Zip: '60201',
      }),
    },
    {
      id: 'source-filer-address',
      companyId: 'company-1',
      sourceFile: 'Product.csv',
      sourceRow: 11,
      rawData: JSON.stringify({
        'Filer Name': 'Acme Advisors',
        Address: '2 Filing Road',
        City: 'Boston',
        State: 'MA',
        'Shares Held': '100',
        'Market Value': '5000',
      }),
    },
  ];
  input.importReviewItems = [];

  const plan = buildCanonicalizationPlan(input);
  const companyAddress = mutationFor(plan, 'companies', 'company-1')?.data
    .address as { addressStreet1?: string; addressCity?: string } | undefined;

  assert.equal(companyAddress?.addressStreet1 ?? '', '');
  assert.equal(companyAddress?.addressCity ?? '', '');
  assert.equal(
    mutationFor(plan, 'people', 'person-1')?.data.streetAddress,
    '1 Home Lane',
  );
  assert.equal(
    plan.mutations.some(
      ({ objectPlural, data }) =>
        objectPlural === 'holdingObservations' &&
        data.streetAddress === '2 Filing Road',
    ),
    true,
  );
});

test('recognized fields in the wrong semantic row fail closed', () => {
  const input = snapshot();
  input.sourceRecords = [
    {
      id: 'source-company-with-person-fact',
      companyId: 'company-1',
      sourceFile: 'firms.csv',
      sourceRow: 12,
      rawData: JSON.stringify({
        'Firm Name': 'Acme Advisors',
        Bio: 'No person identity',
      }),
    },
  ];
  input.importReviewItems = [];

  assert.equal(
    buildCanonicalizationPlan(input).unresolved.some(
      ({ code }) => code === 'UNHANDLED_RAW_FIELD',
    ),
    true,
  );
});

test('canonical dispositions name concrete targets and hash fresh values', () => {
  const input = snapshot();
  const first = buildCanonicalizationPlan(input);
  const bio = first.dispositions.find(({ key }) => key === 'bio');

  assert.match(String(bio?.target), /people\/person-1\.bio/);
  assert.match(String(bio?.targetValueHash), /^[a-f0-9]{64}$/);
});

test('person address promotion preserves values that are still under pre-DDL names', () => {
  const input = snapshot();
  Object.assign(input.people[0]!, {
    legacyAddress: '99 Existing Street',
    legacyCity: 'Chicago',
    legacyStateRegion: 'IL',
    legacyPostalCode: '60601',
  });
  input.sourceRecords = [
    {
      id: 'source-address-update',
      companyId: 'company-1',
      sourceFile: 'people.csv',
      sourceRow: 13,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'Alex',
        'Last Name': 'Smith',
        'Email 1': 'alex@acme.example',
        Address: '100 New Street',
        City: 'Evanston',
        State: 'Illinois',
        Zip: '60201',
      }),
    },
  ];
  input.importReviewItems = [];

  const first = buildCanonicalizationPlan(input);
  const person = mutationFor(first, 'people', 'person-1')!;
  assert.equal(person.data.streetAddress, '100 New Street\n99 Existing Street');
  assert.equal(person.data.city, 'Chicago\nEvanston');
  assert.equal(person.data.stateRegion, 'IL\nIllinois');
  assert.equal(person.data.postalCode, '60201\n60601');

  Object.assign(input.people[0]!, person.data);
  delete input.people[0]!.legacyAddress;
  delete input.people[0]!.legacyCity;
  delete input.people[0]!.legacyStateRegion;
  delete input.people[0]!.legacyPostalCode;
  assert.equal(
    buildCanonicalizationPlan(input).mutations.some(
      ({ objectPlural, id }) => objectPlural === 'people' && id === 'person-1',
    ),
    false,
  );
});

test('conflicting company facts use explicit neutral fallback fields', () => {
  const input = snapshot();
  input.companies[0]!.employees = 1000;
  input.companies[0]!.domainName = {
    primaryLinkLabel: 'Existing',
    primaryLinkUrl: 'https://existing.example',
    secondaryLinks: [],
  };
  input.companies[0]!.address = {
    addressStreet1: '1 Existing Road',
    addressStreet2: '',
    addressCity: 'Chicago',
    addressState: 'IL',
    addressPostcode: '60601',
    addressCountry: 'US',
    addressLat: null,
    addressLng: null,
  };
  input.sourceRecords = [
    {
      id: 'source-employee-conflict',
      companyId: 'company-1',
      sourceFile: 'firms.csv',
      sourceRow: 14,
      rawData: JSON.stringify({
        'Firm Name': 'Acme Advisors',
        'Firm Total Employees': '100',
        'Firm Website': 'other.example',
        'Firm Address': '2 Source Street',
        'Firm City': 'Evanston',
        'Firm State': 'IL',
        'Firm Zip': '60201',
      }),
    },
  ];
  input.importReviewItems = [];

  const plan = buildCanonicalizationPlan(input);
  const company = mutationFor(plan, 'companies', 'company-1');

  assert.equal(plan.unresolved.length, 0);
  assertPlanCanApply(plan);
  assert.match(String(company?.data.description), /Employees: 100/);
  assert.match(String(company?.data.websiteNotes), /acme\.example/);
  assert.match(String(company?.data.websiteNotes), /other\.example/);
  assert.match(String(company?.data.alternateAddresses), /2 Source Street/);
});

test('invalid contact structures are retained in other contact details', () => {
  const input = snapshot();
  input.sourceRecords = [
    {
      id: 'source-residual-contacts',
      companyId: 'company-1',
      sourceFile: 'people.csv',
      sourceRow: 18,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'Alex',
        'Last Name': 'Smith',
        'Email 3': 'ask assistant for email',
        Phone: 'call the main office',
        LinkedIn: 'not supplied',
      }),
    },
  ];
  input.importReviewItems = [];

  const plan = buildCanonicalizationPlan(input);
  const person = mutationFor(plan, 'people', 'person-1');

  assert.equal(
    plan.unresolved.some(
      ({ code }) =>
        code === 'DISPOSITION_TARGET_EMPTY' ||
        code === 'DISPOSITION_VALUE_NOT_PRESERVED' ||
        code === 'UNHANDLED_RAW_FIELD',
    ),
    false,
    plan.unresolved.map(({ code }) => code).join(', '),
  );
  assertPlanCanApply(plan);
  assert.match(
    String(person?.data.otherContactDetails),
    /ask assistant for email/,
  );
  assert.match(
    String(person?.data.otherContactDetails),
    /call the main office/,
  );
  assert.match(String(person?.data.otherContactDetails), /not supplied/);
});

test('holding dates normalize and explicit placeholders are safely disposed', () => {
  const input = snapshot();
  const rawData = JSON.parse(
    String(input.holdingObservations[0]!.rawData),
  ) as Record<string, unknown>;
  rawData['Source Date'] = '2026-06-30T00:00:00.000Z';
  input.holdingObservations[0]!.rawData = JSON.stringify(rawData);
  input.holdingObservations[0]!.sourceDate = '2026-06-30';

  const normalizedPlan = buildCanonicalizationPlan(input);

  assert.equal(
    normalizedPlan.unresolved.some(
      ({ code }) =>
        code === 'HOLDING_DATE_INVALID' || code === 'HOLDING_FIELD_CONFLICT',
    ),
    false,
  );
  assertPlanCanApply(normalizedPlan);

  rawData['Source Date'] = 'not reported';
  input.holdingObservations[0]!.rawData = JSON.stringify(rawData);
  delete input.holdingObservations[0]!.sourceDate;
  const placeholderPlan = buildCanonicalizationPlan(input);
  const sourceDateDisposition = placeholderPlan.dispositions.find(
    ({ key }) => key === 'source date',
  );

  assert.equal(
    placeholderPlan.unresolved.some(
      ({ code }) => code === 'HOLDING_DATE_INVALID',
    ),
    false,
  );
  assert.equal(sourceDateDisposition?.kind, 'ignored');
  assert.match(
    String(sourceDateDisposition?.target),
    /explicit date placeholder/i,
  );
});

test('natural-language holding dates normalize while unsupported dates fail closed', () => {
  const input = snapshot();
  const rawData = JSON.parse(
    String(input.holdingObservations[0]!.rawData),
  ) as Record<string, unknown>;
  rawData['Source Date'] = 'June 30, 2026';
  input.holdingObservations[0]!.rawData = JSON.stringify(rawData);
  delete input.holdingObservations[0]!.sourceDate;

  const naturalLanguagePlan = buildCanonicalizationPlan(input);

  assertPlanCanApply(naturalLanguagePlan);
  assert.equal(
    mutationFor(naturalLanguagePlan, 'holdingObservations', 'holding-1')?.data
      .asOfDate,
    '2026-06-30',
  );

  rawData['Source Date'] = 'end of second quarter 2026';
  input.holdingObservations[0]!.rawData = JSON.stringify(rawData);
  const unsupportedPlan = buildCanonicalizationPlan(input);
  const sourceDateDisposition = unsupportedPlan.dispositions.find(
    ({ key }) => key === 'source date',
  );

  assert.equal(
    unsupportedPlan.unresolved.some(
      ({ code }) => code === 'HOLDING_DATE_INVALID',
    ),
    true,
  );
  assert.notEqual(sourceDateDisposition?.kind, 'ignored');
  assert.throws(() => assertPlanCanApply(unsupportedPlan), /unresolved/i);
});

test('known optional source fields have explicit business dispositions', () => {
  const input = snapshot();
  input.sourceRecords = [
    {
      id: 'source-optional-fields',
      companyId: 'company-1',
      sourceFile: 'people.csv',
      sourceRow: 19,
      rawData: JSON.stringify({
        RIA: 'Acme Advisors',
        'First Name': 'Alex',
        'Last Name': 'Smith',
        Notes: 'Call after the conference',
        Disclosures: 'Public disclosure detail',
        'Person Tag - Expertise': 'Retirement planning',
        'Lead Score': 'A',
        'Connection Name': 'Introduced by partner',
      }),
    },
  ];
  input.importReviewItems = [];

  const plan = buildCanonicalizationPlan(input);
  const person = mutationFor(plan, 'people', 'person-1');
  const company = mutationFor(plan, 'companies', 'company-1');

  assert.equal(
    plan.unresolved.some(({ code }) => code === 'UNHANDLED_RAW_FIELD'),
    false,
  );
  assertPlanCanApply(plan);
  assert.match(String(person?.data.notes), /Call after the conference/);
  assert.match(String(person?.data.notes), /Public disclosure detail/);
  assert.match(String(person?.data.notes), /Retirement planning/);
  assert.match(String(company?.data.description), /Lead score: A/);
  assert.match(
    String(person?.data.otherContactDetails),
    /Introduced by partner/,
  );
});

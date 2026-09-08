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
  buildReconciliationReport,
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
  assert.equal(company?.data.description, null);
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

test('ambiguous name-only company matches fail closed without writes', () => {
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
    true,
  );
  assert.throws(() => assertPlanCanApply(plan), /unresolved/i);
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

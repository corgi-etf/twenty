import assert from 'node:assert/strict';
import test from 'node:test';

import { chunkRecords } from '../src/batching.ts';
import { deterministicId } from '../src/deterministic-id.ts';
import {
  assertPlanIntegrity,
  canonicalJson,
  sealPlan,
  sourceRowHmac,
} from '../src/integrity.ts';
import { buildPlan, type MinimalSnapshot } from '../src/planner.ts';

test('deterministicId returns a stable RFC 4122 version 5 UUID per source key', () => {
  const id = deterministicId('company', 'legacy-123');

  assert.equal(id, deterministicId('company', 'legacy-123'));
  assert.notEqual(id, deterministicId('person', 'legacy-123'));
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test('canonicalJson and HMAC are insensitive to object key ordering', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(
    sourceRowHmac({ b: 2, a: 1 }, 'test-key'),
    sourceRowHmac({ a: 1, b: 2 }, 'test-key'),
  );
});

test('sealed plans reject any mutation', () => {
  const plan = sealPlan({ records: [{ id: 'one' }] });
  assert.doesNotThrow(() => assertPlanIntegrity(plan));

  plan.records[0]!.id = 'tampered';
  assert.throws(() => assertPlanIntegrity(plan), /hash/i);
});

test('chunkRecords enforces the API maximum and never emits empty batches', () => {
  const records = Array.from({ length: 201 }, (_, index) => index);

  assert.deepEqual(
    chunkRecords(records).map((batch) => batch.length),
    [100, 100, 1],
  );
  assert.deepEqual(chunkRecords([]), []);
  assert.throws(() => chunkRecords(records, 101), /100/);
});

test('planning preserves duplicate companies and deterministically chooses email and domain holders', () => {
  const snapshot: MinimalSnapshot = {
    companies: [
      {
        id: 'b',
        name: 'Acme II',
        normalized_name: 'acme',
        website: 'https://acme.example',
      },
      {
        id: 'a',
        name: 'Acme',
        normalized_name: 'acme',
        website: 'acme.example',
      },
    ],
    contacts: [
      {
        id: 'z',
        company_id: 'b',
        first_name: 'Zed',
        email: 'SAME@example.com',
      },
      {
        id: 'c',
        company_id: 'a',
        first_name: 'Cee',
        email: 'same@example.com',
      },
    ],
  };

  const plan = buildPlan(snapshot, { migrationRunId: 'run-1', hmacKey: 'key' });
  const companies = plan.records.filter(
    ({ objectPlural }) => objectPlural === 'companies',
  );
  const people = plan.records.filter(
    ({ objectPlural }) => objectPlural === 'people',
  );

  assert.equal(companies.length, 2);
  assert.equal(people.length, 2);
  assert.deepEqual(
    companies.map(({ sourceId }) => sourceId),
    ['a', 'b'],
  );
  assert.deepEqual(companies[0]!.payload.domainName, {
    primaryLinkLabel: 'acme.example',
    primaryLinkUrl: 'https://acme.example',
    secondaryLinks: [],
  });
  assert.equal(companies[1]!.payload.domainName, undefined);
  assert.deepEqual(people[0]!.payload.emails, {
    primaryEmail: 'same@example.com',
    additionalEmails: [],
  });
  assert.equal(people[1]!.payload.emails, undefined);
  assert.equal(people[1]!.payload.legacyEmail, 'same@example.com');
  assert.deepEqual(plan.warnings.map(({ code }) => code).sort(), [
    'COMPANY_DOMAIN_COLLISION',
    'COMPANY_NAME_COLLISION',
    'PERSON_EMAIL_COLLISION',
  ]);

  const reversed = buildPlan(
    {
      companies: [...snapshot.companies].reverse(),
      contacts: [...snapshot.contacts].reverse(),
    },
    { migrationRunId: 'run-1', hmacKey: 'key' },
  );
  assert.deepEqual(reversed, plan);
});

test('planning transforms every Fetch relationship into ordered Twenty records', () => {
  const plan = buildPlan(
    {
      companies: [
        {
          id: 'company-1',
          name: 'Mapped Co',
          city: 'Chicago',
          state_region: 'IL',
          country: 'United States',
          status: 'active',
          owned_by_user_id: 'user-1',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      companyLocations: [
        {
          company_id: 'company-1',
          latitude: 41.88,
          longitude: -87.63,
          formatted_address: 'Chicago, IL',
          precision: 'city',
          source: 'geocoder',
          is_manual: false,
        },
      ],
      contacts: [
        {
          id: 'contact-1',
          company_id: 'company-1',
          first_name: 'Casey',
          last_name: 'Buyer',
          phone: '+13125550100',
          linkedin: 'https://linkedin.com/in/casey',
        },
      ],
      users: [
        {
          auth_user_id: 'user-1',
          name: 'Whitney Wholesaler',
          email: 'whitney@example.com',
          role: 'admin',
          disabled_at: null,
        },
      ],
      authUsers: [
        {
          id: 'user-1',
          name: 'Whitney Wholesaler',
          email: 'whitney@example.com',
          role: 'admin',
          banned: false,
        },
      ],
      teams: [{ id: 'team-1', name: 'Central' }],
      teamMemberships: [
        { id: 'membership-1', team_id: 'team-1', user_id: 'user-1' },
      ],
      assignments: [
        {
          id: 'assignment-1',
          company_id: 'company-1',
          contact_id: 'contact-1',
          user_id: 'user-1',
          assignment_date: '2025-02-01',
          status: 'assigned',
        },
      ],
      activities: [
        {
          id: 'activity-1',
          company_id: 'company-1',
          contact_id: 'contact-1',
          user_id: 'user-1',
          activity_type: 'call',
          outcome: 'connected',
          notes: 'Good conversation',
          occurred_at: '2025-02-02T00:00:00Z',
        },
      ],
      followUps: [
        {
          id: 'followup-1',
          company_id: 'company-1',
          contact_id: 'contact-1',
          user_id: 'user-1',
          due_date: '2025-02-03',
          status: 'open',
          notes: 'Send materials',
        },
      ],
      companySources: [
        {
          id: 'source-1',
          company_id: 'company-1',
          source_file: 'book.xlsx',
          source_sheet: 'Leads',
          source_row: 7,
          source_type: 'import',
          source_label: 'Book',
        },
      ],
      holdingObservations: [
        {
          id: 'holding-1',
          company_id: 'company-1',
          product_name: 'ETF A',
          filer_name: 'Mapped Co',
          shares_held: 25,
          market_value: 1000,
        },
      ],
      tags: [{ id: 'tag-1', name: 'Buffer Buyer' }],
      companyTags: [{ company_id: 'company-1', tag_id: 'tag-1' }],
      importBatches: [
        {
          id: 'batch-1',
          file_name: 'book.xlsx',
          status: 'committed',
          uploaded_by: 'user-1',
          row_count: 10,
          review_count: 1,
          preview_data: { headers: ['Company'] },
        },
      ],
      importReviewItems: [
        {
          id: 'review-1',
          import_batch_id: 'batch-1',
          source_file: 'book.xlsx',
          source_sheet: 'Leads',
          source_row: 8,
          reason: 'Multiple possible company matches',
          candidate_company_id: 'company-1',
          raw_data: { Company: 'Possible duplicate' },
          status: 'pending',
        },
      ],
      archivedActivities: [
        {
          id: 'archived-1',
          company_id: 'company-1',
          contact_id: 'contact-1',
          user_id: 'user-1',
          activity_type: 'call',
          notes: 'Duplicate history',
          canonical_activity_id: 'activity-1',
          archive_reason: 'duplicate',
          archived_at: '2025-02-05T00:00:00Z',
        },
      ],
    },
    { migrationRunId: 'run-full', hmacKey: 'key' },
  );

  assert.deepEqual(
    plan.records.map(({ objectPlural }) => objectPlural),
    [
      'wholesalers',
      'salesTeams',
      'teamMemberships',
      'companies',
      'people',
      'leadAssignments',
      'outreachActivities',
      'tasks',
      'taskTargets',
      'sourceRecords',
      'holdingObservations',
      'importBatches',
      'importReviewItems',
      'archivedOutreachActivities',
    ],
  );
  const company = plan.records.find(
    ({ objectPlural }) => objectPlural === 'companies',
  )!;
  assert.deepEqual(company.payload.address, {
    addressStreet1: 'Chicago, IL',
    addressStreet2: '',
    addressCity: 'Chicago',
    addressState: 'IL',
    addressPostcode: '',
    addressCountry: 'United States',
    addressLat: 41.88,
    addressLng: -87.63,
  });
  assert.deepEqual(company.payload.fetchTags, ['BUFFER_BUYER']);
  assert.equal(
    company.payload.historicalOwnerId,
    deterministicId('wholesaler', 'user-1'),
  );
  const person = plan.records.find(
    ({ objectPlural }) => objectPlural === 'people',
  )!;
  assert.equal(
    person.payload.companyId,
    deterministicId('company', 'company-1'),
  );
  assert.deepEqual(person.payload.phones, {
    primaryPhoneNumber: '3125550100',
    primaryPhoneCountryCode: 'US',
    primaryPhoneCallingCode: '+1',
    additionalPhones: [],
  });
  assert.equal(person.payload.legacyPrimaryPhone, '+13125550100');
  const taskTarget = plan.records.find(
    ({ objectPlural }) => objectPlural === 'taskTargets',
  )!;
  assert.equal(
    taskTarget.payload.taskId,
    deterministicId('task', 'followup-1'),
  );
  assert.equal(
    taskTarget.payload.targetCompanyId,
    deterministicId('company', 'company-1'),
  );
  assert.equal(taskTarget.payload.targetPersonId, undefined);
  assert.deepEqual(plan.invitationPlan, [
    {
      email: 'whitney@example.com',
      name: 'Whitney Wholesaler',
      requestedRole: 'admin',
      sourceUserId: 'user-1',
    },
  ]);
  const task = plan.records.find(
    ({ objectPlural }) => objectPlural === 'tasks',
  )!;
  assert.equal(task.payload.dueAt, '2025-02-03T00:00:00.000Z');
  const review = plan.records.find(
    ({ objectPlural }) => objectPlural === 'importReviewItems',
  )!;
  assert.equal(
    review.payload.candidateCompanyId,
    deterministicId('company', 'company-1'),
  );
  assert.equal(
    plan.records.filter(({ objectPlural }) => objectPlural === 'companies')
      .length,
    1,
    'pending review rows must not be promoted to companies',
  );
});

test('duplicate email canonical holder prefers primary and richer contacts before stable ID', () => {
  const plan = buildPlan(
    {
      companies: [{ id: 'company', name: 'Company' }],
      contacts: [
        { id: 'a', company_id: 'company', email: 'same@example.com' },
        {
          id: 'z',
          company_id: 'company',
          email: 'same@example.com',
          first_name: 'Primary',
          title: 'Buyer',
          phone: '+13125550100',
          is_primary: true,
        },
      ],
    },
    { migrationRunId: 'run', hmacKey: 'key' },
  );
  const people = plan.records.filter(
    ({ objectPlural }) => objectPlural === 'people',
  );

  assert.equal(
    people.find(({ sourceId }) => sourceId === 'a')!.payload.emails,
    undefined,
  );
  assert.deepEqual(
    people.find(({ sourceId }) => sourceId === 'z')!.payload.emails,
    {
      primaryEmail: 'same@example.com',
      additionalEmails: [],
    },
  );
});

test('phone transform emits only validated US components and retains every raw value', () => {
  const plan = buildPlan(
    {
      companies: [{ id: 'company', name: 'Company' }],
      contacts: [
        { id: 'plain', company_id: 'company', phone: '3102535000' },
        {
          id: 'punctuated',
          company_id: 'company',
          phone: '(312) 555-0100 ext. 42',
        },
        { id: 'plus-one', company_id: 'company', phone: '+1 415 555 0100' },
        {
          id: 'international',
          company_id: 'company',
          phone: '+44 20 7946 0958',
        },
        { id: 'ambiguous', company_id: 'company', phone: '555-0100' },
      ],
    },
    { migrationRunId: 'run', hmacKey: 'key' },
  );
  const people = new Map(
    plan.records
      .filter(({ objectPlural }) => objectPlural === 'people')
      .map((record) => [record.sourceId, record.payload]),
  );

  assert.deepEqual(people.get('plain')?.phones, {
    primaryPhoneNumber: '3102535000',
    primaryPhoneCountryCode: 'US',
    primaryPhoneCallingCode: '+1',
    additionalPhones: [],
  });
  assert.deepEqual(people.get('punctuated')?.phones, {
    primaryPhoneNumber: '3125550100',
    primaryPhoneCountryCode: 'US',
    primaryPhoneCallingCode: '+1',
    additionalPhones: [],
  });
  assert.deepEqual(people.get('plus-one')?.phones, {
    primaryPhoneNumber: '4155550100',
    primaryPhoneCountryCode: 'US',
    primaryPhoneCallingCode: '+1',
    additionalPhones: [],
  });
  assert.equal(people.get('international')?.phones, undefined);
  assert.equal(people.get('ambiguous')?.phones, undefined);
  assert.equal(
    people.get('punctuated')?.legacyPrimaryPhone,
    '(312) 555-0100 ext. 42',
  );
  assert.equal(
    people.get('international')?.legacyPrimaryPhone,
    '+44 20 7946 0958',
  );
  assert.equal(people.get('ambiguous')?.legacyPrimaryPhone, '555-0100');
});

test('auth reconciliation invites only active matched users and reports identity gaps', () => {
  const plan = buildPlan(
    {
      companies: [],
      contacts: [],
      users: [
        {
          auth_user_id: 'matched',
          name: 'Matched',
          email: 'role@example.com',
          role: 'member',
        },
        {
          auth_user_id: 'role-only',
          name: 'Legacy Only',
          email: 'legacy@example.com',
          role: 'member',
        },
      ],
      authUsers: [
        {
          id: 'matched',
          name: 'Auth Name',
          email: 'auth@example.com',
          banned: false,
        },
        {
          id: 'auth-only',
          name: 'No Role',
          email: 'norole@example.com',
          banned: false,
        },
      ],
    },
    { migrationRunId: 'run', hmacKey: 'key' },
  );

  assert.deepEqual(plan.invitationPlan, [
    {
      email: 'auth@example.com',
      name: 'Auth Name',
      requestedRole: 'member',
      sourceUserId: 'matched',
    },
  ]);
  assert.deepEqual(plan.warnings.map(({ code }) => code).sort(), [
    'AUTH_USER_WITHOUT_ROLE',
    'ROLE_WITHOUT_AUTH_USER',
  ]);
  assert.equal(
    plan.records.filter(({ objectPlural }) => objectPlural === 'wholesalers')
      .length,
    2,
  );
});

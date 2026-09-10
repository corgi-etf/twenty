import {
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import companyAllocationsOnCompany from 'src/fields/company-allocations-on-company.field';
import companyOnCompanyAllocation from 'src/fields/company-on-company-allocation.field';
import * as allocationIdentifiers from 'src/modules/allocation/allocation-identifiers';
import * as meetingIdentifiers from 'src/modules/meeting/meeting-identifiers';
import * as telegramIdentifiers from 'src/modules/telegram/telegram-persistence-identifiers';
import companyAllocation from 'src/objects/company-allocation.object';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const field = (name: string) =>
  companyAllocation.config.fields.find(
    (candidate) => candidate.name === name,
  );

describe('Company allocation metadata', () => {
  it('defines a per-ticker allocation whose record label is the ticker', () => {
    expect(companyAllocation.success).toBe(true);
    expect(companyAllocation.config).toMatchObject({
      universalIdentifier:
        allocationIdentifiers.COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
      nameSingular: 'companyAllocation',
      namePlural: 'companyAllocations',
      labelSingular: 'Allocation',
      labelPlural: 'Allocations',
      isSearchable: true,
      labelIdentifierFieldMetadataUniversalIdentifier:
        allocationIdentifiers.COMPANY_ALLOCATION_TICKER_FIELD_UNIVERSAL_IDENTIFIER,
    });
  });

  it('stores the ticker as free text and the allocation as a currency amount', () => {
    expect(field('ticker')).toMatchObject({
      universalIdentifier:
        allocationIdentifiers.COMPANY_ALLOCATION_TICKER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      label: 'Ticker',
      defaultValue: "''",
    });
    expect(field('amount')).toMatchObject({
      universalIdentifier:
        allocationIdentifiers.COMPANY_ALLOCATION_AMOUNT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.CURRENCY,
      label: 'Amount',
      isNullable: true,
    });
  });

  it('leaves both allocation inputs editable by CRM users', () => {
    for (const name of ['ticker', 'amount']) {
      expect(field(name)?.isUIEditable).toBeUndefined();
      expect(field(name)?.writability).toBeUndefined();
    }
  });

  it('hangs many allocations off one company and names the section Allocations', () => {
    expect(companyOnCompanyAllocation.success).toBe(true);
    expect(companyOnCompanyAllocation.config).toMatchObject({
      objectUniversalIdentifier:
        allocationIdentifiers.COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
      name: 'company',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        allocationIdentifiers.COMPANY_ALLOCATIONS_ON_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'companyId',
      },
    });
    expect(companyAllocationsOnCompany.success).toBe(true);
    expect(companyAllocationsOnCompany.config).toMatchObject({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
      name: 'allocations',
      label: 'Allocations',
      relationTargetObjectMetadataUniversalIdentifier:
        allocationIdentifiers.COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        allocationIdentifiers.COMPANY_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    });
  });

  it('uses fresh universal identifiers that collide with no other app entity', () => {
    const allocationValues = Object.values(allocationIdentifiers);
    for (const value of allocationValues) {
      expect(value).toMatch(UUID_PATTERN);
    }
    expect(new Set(allocationValues).size).toBe(allocationValues.length);
    const otherValues = [
      ...Object.values(meetingIdentifiers),
      ...Object.values(telegramIdentifiers),
    ].flatMap((value) =>
      typeof value === 'string'
        ? [value]
        : Object.values(value as Record<string, string>),
    );
    for (const value of allocationValues) {
      expect(otherValues).not.toContain(value);
    }
  });
});

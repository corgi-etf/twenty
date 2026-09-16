import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  COMPANY_ALLOCATION_AMOUNT_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_CONFIRMATION_LINK_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_DATE_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_EXPENSE_RATIO_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_TICKER_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/allocation/allocation-identifiers';

export default defineObject({
  universalIdentifier: COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'companyAllocation',
  namePlural: 'companyAllocations',
  labelSingular: 'Allocation',
  labelPlural: 'Allocations',
  description: 'A dollar amount an RIA or company allocates to one ticker',
  icon: 'IconChartPie',
  isSearchable: true,
  // The ticker is the row's identity, so it doubles as the record label
  // instead of a separate name field nobody would fill in.
  labelIdentifierFieldMetadataUniversalIdentifier:
    COMPANY_ALLOCATION_TICKER_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier:
        COMPANY_ALLOCATION_TICKER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'ticker',
      label: 'Fund Ticker',
      description: 'Security symbol, for example AAPL, BRK.B, or RY-PA.TO',
      icon: 'IconChartCandle',
      defaultValue: "''",
    },
    {
      universalIdentifier:
        COMPANY_ALLOCATION_AMOUNT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.CURRENCY,
      name: 'amount',
      label: 'Amount',
      description: 'Amount allocated to this ticker',
      icon: 'IconCurrencyDollar',
      isNullable: true,
    },
    {
      universalIdentifier: COMPANY_ALLOCATION_DATE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE,
      name: 'allocationDate',
      label: 'Allocation Date',
      description: 'The day the allocation was made',
      icon: 'IconCalendarDollar',
      isNullable: true,
    },
    {
      universalIdentifier:
        COMPANY_ALLOCATION_CONFIRMATION_LINK_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.LINKS,
      name: 'confirmationLink',
      label: 'Confirmation Link',
      description: 'Where the allocation is evidenced, for example a trade confirmation',
      icon: 'IconLink',
      isNullable: true,
    },
    {
      universalIdentifier:
        COMPANY_ALLOCATION_EXPENSE_RATIO_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'expenseRatio',
      label: 'Expense Ratio',
      description: 'Fund expense ratio as a percentage, for example 0.65 for 0.65%',
      icon: 'IconPercentage',
      isNullable: true,
    },
  ],
});

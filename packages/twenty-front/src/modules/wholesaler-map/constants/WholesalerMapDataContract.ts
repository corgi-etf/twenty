import { CoreObjectNameSingular } from 'twenty-shared/types';

export const WHOLESALER_MAP_DATA_CONTRACT = {
  companyObjectNameSingular: CoreObjectNameSingular.Company,
  companyNameFieldName: 'name',
  companyAddressFieldName: 'address',
  wholesalerRelationFieldName: 'historicalOwner',
  wholesalerObjectNameSingular: 'wholesaler',
  wholesalerNameFieldName: 'name',
  pageSize: 200,
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
} as const;

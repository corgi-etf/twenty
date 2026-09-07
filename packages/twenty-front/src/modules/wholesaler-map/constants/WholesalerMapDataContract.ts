import { CoreObjectNameSingular } from 'twenty-shared/types';

export const WHOLESALER_MAP_DATA_CONTRACT = {
  companyObjectNameSingular: CoreObjectNameSingular.Company,
  companyNameFieldName: 'name',
  companyAddressFieldName: 'address',
  wholesalerRelationFieldName: 'historicalOwner',
  wholesalerObjectNameSingular: 'wholesaler',
} as const;

export const WHOLESALER_MAP_PAGE_SIZE = 200;

export const WHOLESALER_MAP_STYLE_URL =
  'https://tiles.openfreemap.org/styles/liberty';

import { CoreObjectNameSingular } from 'twenty-shared/types';

export const WHOLESALER_MAP_DATA_CONTRACT = {
  companyObjectNameSingular: CoreObjectNameSingular.Company,
  companyNameFieldName: 'name',
  companyAddressFieldName: 'address',
  companyDescriptionFieldName: 'description',
  companyFirmPhoneFieldName: 'firmPhone',
  companyLeadStatusFieldName: 'leadStatus',
  companyLinkedinFieldName: 'linkedinLink',
  companyWebsiteNotesFieldName: 'websiteNotes',
  wholesalerRelationFieldName: 'historicalOwner',
  wholesalerObjectNameSingular: 'wholesaler',
  wholesalerNameFieldName: 'name',
  wholesalerTerritoryFieldName: 'territory',
  pageSize: 200,
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
} as const;

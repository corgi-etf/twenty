import { type RecordGqlOperationGqlRecordFields } from 'twenty-shared/types';

import { WHOLESALER_MAP_DATA_CONTRACT } from '@/wholesaler-map/constants/WholesalerMapDataContract';

type GetWholesalerMapAccessArgs = {
  canReadCompanyRecords: boolean;
  canReadWholesalerRecords: boolean;
  readableCompanyFieldNames: string[];
  readableWholesalerFieldNames: string[];
};

export type WholesalerMapAccess = {
  canViewMap: boolean;
  hasWholesalerRelation: boolean;
  recordGqlFields: RecordGqlOperationGqlRecordFields;
};

export const getWholesalerMapAccess = (
  args: GetWholesalerMapAccessArgs,
): WholesalerMapAccess => {
  const readableFieldNames = new Set(args.readableCompanyFieldNames);
  const hasRequiredFields = [
    WHOLESALER_MAP_DATA_CONTRACT.companyNameFieldName,
    WHOLESALER_MAP_DATA_CONTRACT.companyAddressFieldName,
  ].every((fieldName) => readableFieldNames.has(fieldName));
  const canViewMap = args.canReadCompanyRecords && hasRequiredFields;
  const hasWholesalerRelation =
    readableFieldNames.has(
      WHOLESALER_MAP_DATA_CONTRACT.wholesalerRelationFieldName,
    ) &&
    args.canReadWholesalerRecords &&
    args.readableWholesalerFieldNames.includes(
      WHOLESALER_MAP_DATA_CONTRACT.wholesalerNameFieldName,
    );
  const optionalCompanyFields = [
    WHOLESALER_MAP_DATA_CONTRACT.companyDescriptionFieldName,
    WHOLESALER_MAP_DATA_CONTRACT.companyFirmPhoneFieldName,
    WHOLESALER_MAP_DATA_CONTRACT.companyLeadStatusFieldName,
    WHOLESALER_MAP_DATA_CONTRACT.companyLinkedinFieldName,
    WHOLESALER_MAP_DATA_CONTRACT.companyWebsiteNotesFieldName,
  ].filter((fieldName) => readableFieldNames.has(fieldName));

  if (!canViewMap) {
    return {
      canViewMap,
      hasWholesalerRelation: false,
      recordGqlFields: {},
    };
  }

  return {
    canViewMap,
    hasWholesalerRelation,
    recordGqlFields: {
      id: true,
      [WHOLESALER_MAP_DATA_CONTRACT.companyNameFieldName]: true,
      [WHOLESALER_MAP_DATA_CONTRACT.companyAddressFieldName]: true,
      ...Object.fromEntries(
        optionalCompanyFields.map((fieldName) => [fieldName, true]),
      ),
      ...(hasWholesalerRelation
        ? {
            [WHOLESALER_MAP_DATA_CONTRACT.wholesalerRelationFieldName]: {
              id: true,
              name: true,
              ...(args.readableWholesalerFieldNames.includes(
                WHOLESALER_MAP_DATA_CONTRACT.wholesalerTerritoryFieldName,
              )
                ? {
                    [WHOLESALER_MAP_DATA_CONTRACT.wholesalerTerritoryFieldName]: true,
                  }
                : {}),
            },
          }
        : {}),
    },
  };
};

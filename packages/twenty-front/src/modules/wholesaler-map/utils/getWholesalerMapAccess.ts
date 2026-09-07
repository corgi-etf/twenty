import { type RecordGqlOperationGqlRecordFields } from 'twenty-shared/types';

import { WHOLESALER_MAP_DATA_CONTRACT } from '@/wholesaler-map/constants/WholesalerMapDataContract';

type GetWholesalerMapAccessArgs = {
  canReadCompanyRecords: boolean;
  readableCompanyFieldNames: string[];
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
  const hasWholesalerRelation = readableFieldNames.has(
    WHOLESALER_MAP_DATA_CONTRACT.wholesalerRelationFieldName,
  );

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
      ...(hasWholesalerRelation
        ? {
            [WHOLESALER_MAP_DATA_CONTRACT.wholesalerRelationFieldName]: {
              id: true,
              name: true,
            },
          }
        : {}),
    },
  };
};

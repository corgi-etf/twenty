import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { WHOLESALER_MAP_DATA_CONTRACT } from '@/wholesaler-map/constants/WholesalerMapDataContract';
import { getWholesalerMapAccess } from '@/wholesaler-map/utils/getWholesalerMapAccess';

export const useWholesalerMapAccess = () => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular:
      WHOLESALER_MAP_DATA_CONTRACT.companyObjectNameSingular,
  });
  const objectPermissions = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );
  const readableCompanyFieldNames = objectMetadataItem.readableFields.map(
    ({ name }) => name,
  );
  const access = getWholesalerMapAccess({
    canReadCompanyRecords: objectPermissions.canReadObjectRecords,
    readableCompanyFieldNames,
  });

  return {
    ...access,
    objectMetadataItem,
  };
};

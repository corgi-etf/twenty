import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { WHOLESALER_MAP_DATA_CONTRACT } from '@/wholesaler-map/constants/WholesalerMapDataContract';
import { getWholesalerMapAccess } from '@/wholesaler-map/utils/getWholesalerMapAccess';

export const useWholesalerMapAccess = () => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: WHOLESALER_MAP_DATA_CONTRACT.companyObjectNameSingular,
  });
  const objectPermissions = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );
  const { objectMetadataItems } = useObjectMetadataItems();
  const wholesalerRelationField = objectMetadataItem.readableFields.find(
    ({ name }) =>
      name === WHOLESALER_MAP_DATA_CONTRACT.wholesalerRelationFieldName,
  );
  const wholesalerTargetObjectMetadataId =
    wholesalerRelationField?.relation?.targetObjectMetadata.id;
  const wholesalerObjectMetadataItem = objectMetadataItems.find(
    ({ id, nameSingular }) =>
      id === wholesalerTargetObjectMetadataId &&
      nameSingular ===
        WHOLESALER_MAP_DATA_CONTRACT.wholesalerObjectNameSingular,
  );
  const wholesalerObjectPermissions = useObjectPermissionsForObject(
    wholesalerObjectMetadataItem?.id ?? objectMetadataItem.id,
  );
  const readableCompanyFieldNames = objectMetadataItem.readableFields.map(
    ({ name }) => name,
  );
  const access = getWholesalerMapAccess({
    canReadCompanyRecords: objectPermissions.canReadObjectRecords,
    canReadWholesalerRecords:
      wholesalerObjectMetadataItem !== undefined &&
      wholesalerObjectPermissions.canReadObjectRecords,
    readableCompanyFieldNames,
    readableWholesalerFieldNames:
      wholesalerObjectMetadataItem?.readableFields.map(({ name }) => name) ??
      [],
  });

  return {
    ...access,
    objectMetadataItem,
  };
};

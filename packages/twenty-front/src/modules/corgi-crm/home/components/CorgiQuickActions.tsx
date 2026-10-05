import { useCorgiCreateRecordDialog } from '@/corgi-crm/forms/hooks/useCorgiCreateRecordDialog';
import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import {
  StyledCorgiActions,
  StyledCorgiButton,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { canCreateRecordsForObjectMetadataItem } from '@/object-record/utils/canCreateRecordsForObjectMetadataItem';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { t } from '@lingui/core/macro';

export const CorgiQuickActions = () => {
  const { openCreateRecord } = useCorgiCreateRecordDialog();
  const { refresh } = useCorgiHome();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const actions = [
    { objectNameSingular: 'outreachActivity', label: t`Log activity` },
    { objectNameSingular: 'meetingBooking', label: t`Book meeting` },
    { objectNameSingular: 'companyAllocation', label: t`Record allocation` },
    { objectNameSingular: 'company', label: t`Create company` },
  ];
  return (
    <StyledCorgiActions>
      {actions
        .filter((action) => {
          const metadata = objectMetadataItems.find(
            (object) => object.nameSingular === action.objectNameSingular,
          );
          return (
            metadata &&
            canCreateRecordsForObjectMetadataItem({
              objectMetadataItem: metadata,
              objectPermissions:
                objectPermissionsByObjectMetadataId[metadata.id],
            })
          );
        })
        .map((action) => (
          <StyledCorgiButton
            key={action.objectNameSingular}
            onClick={() =>
              void openCreateRecord({
                objectNameSingular: action.objectNameSingular,
                initialValues:
                  action.objectNameSingular === 'meetingBooking'
                    ? { status: 'BOOKED' }
                    : undefined,
                onCreated: refresh,
              })
            }
          >
            {action.label}
          </StyledCorgiButton>
        ))}
    </StyledCorgiActions>
  );
};

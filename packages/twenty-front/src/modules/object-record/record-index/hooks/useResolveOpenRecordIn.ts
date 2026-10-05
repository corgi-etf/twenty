import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { resolveOpenRecordIn } from '@/object-record/record-index/utils/resolveOpenRecordIn';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { openRecordInPreferenceState } from '@/workspace-member/states/openRecordInPreferenceState';
import { ObjectOpenRecordIn, OpenRecordIn } from 'twenty-shared/types';
import { useIsMobile } from 'twenty-ui/utilities';

export const useResolveOpenRecordIn = (objectNameSingular: string) => {
  // Non-throwing on purpose: a chip must not crash while metadata is loading.
  const objectMetadataItem = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    {
      objectName: objectNameSingular,
      objectNameType: 'singular',
    },
  );

  const openRecordInPreference = useAtomStateValue(openRecordInPreferenceState);

  const isMobile = useIsMobile();
  const { objectMetadataItems } = useObjectMetadataItems();
  const isCorgiWorkspace = objectMetadataItems.some(
    ({ nameSingular }) => nameSingular === 'outreachActivity',
  );

  if (
    isCorgiWorkspace &&
    [
      'company',
      'person',
      'wholesaler',
      'outreachActivity',
      'meetingBooking',
      'companyAllocation',
      'leadAssignment',
    ].includes(objectNameSingular)
  )
    return OpenRecordIn.RECORD_PAGE;

  return resolveOpenRecordIn({
    objectOpenRecordIn:
      objectMetadataItem?.openRecordIn ?? ObjectOpenRecordIn.USER_CHOICE,
    openRecordInPreference,
    canDisplaySidePanel: !isMobile,
  });
};

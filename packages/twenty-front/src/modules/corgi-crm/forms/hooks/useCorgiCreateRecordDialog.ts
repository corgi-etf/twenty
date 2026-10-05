import {
  corgiCreateDialogsState,
  type CorgiCreateDialog,
} from '@/corgi-crm/forms/states/corgiCreateDialogsState';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useCallback } from 'react';
import { v4 } from 'uuid';

export const useCorgiCreateRecordDialog = () => {
  const [, setDialogs] = useAtomState(corgiCreateDialogsState);
  const { objectMetadataItems } = useObjectMetadataItems();
  const isCorgiWorkspace =
    objectMetadataItems.some(
      ({ nameSingular }) => nameSingular === 'outreachActivity',
    ) &&
    objectMetadataItems.some(
      ({ nameSingular }) => nameSingular === 'wholesaler',
    );
  const openCreateRecord = useCallback(
    (
      options: Pick<
        CorgiCreateDialog,
        'objectNameSingular' | 'initialValues' | 'onCreated'
      >,
    ) =>
      new Promise<ObjectRecord | undefined>((resolve) => {
        setDialogs((dialogs) => [
          ...dialogs,
          {
            ...options,
            id: v4(),
            resolve,
            trigger:
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null,
          },
        ]);
      }),
    [setDialogs],
  );
  return { openCreateRecord, isCorgiWorkspace };
};

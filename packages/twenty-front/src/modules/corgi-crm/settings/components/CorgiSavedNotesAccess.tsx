import { useCorgiHomeEnabled } from '@/corgi-crm/home/hooks/useCorgiHomeEnabled';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { Section } from 'twenty-ui/layout';
import { H2Title } from 'twenty-ui/typography';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const CorgiSavedNotesAccess = () => {
  const { t } = useLingui();
  const enabled = useCorgiHomeEnabled();
  const permissionMap = usePermissionFlagMap();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const note = objectMetadataItems.find(
    ({ nameSingular }) => nameSingular === 'note',
  );

  if (
    !enabled ||
    !permissionMap[PermissionFlagType.WORKSPACE] ||
    !note ||
    !objectPermissionsByObjectMetadataId[note.id]?.canReadObjectRecords
  )
    return null;

  return (
    <Section>
      <H2Title
        title={t`Saved notes`}
        description={t`Review existing notes and link any missing record targets. Linked notes appear on their records.`}
      />
      <Link
        to={getAppPath(AppPath.RecordIndexPage, {
          objectNamePlural: note.namePlural,
        })}
      >
        <Trans>Review saved notes</Trans>
      </Link>
    </Section>
  );
};

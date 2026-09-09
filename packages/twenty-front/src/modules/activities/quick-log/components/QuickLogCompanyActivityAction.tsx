import { useLingui } from '@lingui/react/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { IconPhone } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';

import { QuickLogCompanyActivityModal } from '@/activities/quick-log/components/QuickLogCompanyActivityModal';
import { getQuickLogActivityMetadataStatus } from '@/activities/quick-log/utils/getQuickLogActivityMetadataStatus';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useModal } from '@/ui/layout/modal/hooks/useModal';

type QuickLogCompanyActivityActionProps = {
  objectNameSingular: string;
  companyId: string;
};

type ReadyQuickLogCompanyActivityActionProps = {
  companyId: string;
};

const ReadyQuickLogCompanyActivityAction = ({
  companyId,
}: ReadyQuickLogCompanyActivityActionProps) => {
  const { t } = useLingui();
  const { openModal } = useModal();
  const modalInstanceId = `quick-log-company-activity-${companyId}`;

  return (
    <>
      <Button
        Icon={IconPhone}
        title={t`Log follow-up`}
        ariaLabel={t`Log a follow-up for this company`}
        variant="secondary"
        onClick={() => openModal(modalInstanceId)}
      />
      <QuickLogCompanyActivityModal
        companyId={companyId}
        modalInstanceId={modalInstanceId}
      />
    </>
  );
};

export const QuickLogCompanyActivityAction = ({
  objectNameSingular,
  companyId,
}: QuickLogCompanyActivityActionProps) => {
  const { t } = useLingui();
  const { objectMetadataItems } = useObjectMetadataItems();

  if (objectNameSingular !== CoreObjectNameSingular.Company) {
    return null;
  }

  const metadataStatus = getQuickLogActivityMetadataStatus(objectMetadataItems);

  if (!metadataStatus.isAvailable) {
    return (
      <Button
        Icon={IconPhone}
        title={t`Follow-up unavailable`}
        ariaLabel={metadataStatus.reason}
        variant="secondary"
        disabled
      />
    );
  }

  return <ReadyQuickLogCompanyActivityAction companyId={companyId} />;
};

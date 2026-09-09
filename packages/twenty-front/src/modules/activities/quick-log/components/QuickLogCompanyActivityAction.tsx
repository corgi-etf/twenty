import { useLingui } from '@lingui/react/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { IconPhone } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { AppTooltip } from 'twenty-ui/surfaces';

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

type CompanyQuickLogActivityActionProps = {
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

const CompanyQuickLogActivityAction = ({
  companyId,
}: CompanyQuickLogActivityActionProps) => {
  const { t } = useLingui();
  const { objectMetadataItems } = useObjectMetadataItems();
  const metadataStatus = getQuickLogActivityMetadataStatus(objectMetadataItems);

  if (!metadataStatus.isAvailable) {
    const tooltipId = `quick-log-company-activity-unavailable-${companyId}`;

    return (
      <>
        <div id={tooltipId}>
          <Button
            Icon={IconPhone}
            title={t`Follow-up unavailable`}
            ariaLabel={`${t`Follow-up unavailable`}: ${metadataStatus.reason}`}
            variant="secondary"
            disabled
          />
        </div>
        <AppTooltip
          anchorSelect={`#${tooltipId}`}
          content={metadataStatus.reason}
          place="bottom"
        />
      </>
    );
  }

  return <ReadyQuickLogCompanyActivityAction companyId={companyId} />;
};

export const QuickLogCompanyActivityAction = ({
  objectNameSingular,
  companyId,
}: QuickLogCompanyActivityActionProps) => {
  if (objectNameSingular !== CoreObjectNameSingular.Company) {
    return null;
  }

  return <CompanyQuickLogActivityAction companyId={companyId} />;
};

import { useId } from 'react';
import { useLingui } from '@lingui/react/macro';
import { getCorgiCompanyTypePresentation } from 'twenty-shared/utils';
import { Tag } from 'twenty-ui/data-display';
import { AppTooltip, TooltipDelay } from 'twenty-ui/surfaces';

export const CorgiCompanyTypeBadge = ({
  value,
}: {
  value: string | null | undefined;
}) => {
  const { t } = useLingui();
  const descriptionId = useId();
  const presentation = getCorgiCompanyTypePresentation(value);
  if (!presentation) return null;
  const labels = {
    ria: t`RIA`,
    brokerDealer: t`Broker-dealer`,
    bank: t`Bank`,
    familyOffice: t`Family office`,
    assetManager: t`Asset manager`,
    institution: t`Institution`,
  };
  if (presentation.category !== 'unmapped')
    return (
      <Tag text={labels[presentation.category]} color={presentation.color} />
    );
  const description = t`Unmapped company type`;
  return (
    <>
      <span
        data-company-type-tooltip={descriptionId}
        tabIndex={0}
        aria-describedby={descriptionId}
        title={description}
      >
        <Tag text={presentation.rawValue} color="gray" />
      </span>
      <span id={descriptionId} hidden>
        {description}
      </span>
      <AppTooltip
        anchorSelect={`[data-company-type-tooltip="${descriptionId}"]`}
        content={description}
        delay={TooltipDelay.shortDelay}
      />
    </>
  );
};

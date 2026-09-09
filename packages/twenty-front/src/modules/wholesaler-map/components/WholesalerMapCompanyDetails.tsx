import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type ReactNode } from 'react';
import { LightButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type WholesalerMapFeature } from '@/wholesaler-map/types/WholesalerMapCompany';

const StyledDetails = styled.section`
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledHeadingRow = styled.div`
  align-items: flex-start;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledHeading = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  line-height: 1.35;
  margin: 0;
`;

const StyledStatus = styled.span`
  background: ${themeCssVariables.background.transparent.light};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledDetailsGrid = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  margin: 0;
`;

const StyledLabel = styled.dt`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledValue = styled.dd`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const StyledLink = styled.a`
  color: ${themeCssVariables.font.color.primary};
  text-decoration: underline;
  text-decoration-color: ${themeCssVariables.border.color.strong};
  text-underline-offset: 2px;
`;

const StyledNotes = styled.p`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  color: ${themeCssVariables.font.color.secondary};
  display: -webkit-box;
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.45;
  margin: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
`;

const StyledEmptyDetails = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.45;
  padding: ${themeCssVariables.spacing[5]} ${themeCssVariables.spacing[4]};
`;

type WholesalerMapCompanyDetailsProps = {
  feature: WholesalerMapFeature | null;
  onCompanyOpen: (companyId: string) => void;
};

const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <>
    <StyledLabel>{label}</StyledLabel>
    <StyledValue>{value}</StyledValue>
  </>
);

export const WholesalerMapCompanyDetails = ({
  feature,
  onCompanyOpen,
}: WholesalerMapCompanyDetailsProps) => {
  const { t } = useLingui();

  if (feature === null) {
    return (
      <StyledEmptyDetails data-testid="territory-company-details-empty">
        {t`Select a company on the map or in the list to see its contact details here.`}
      </StyledEmptyDetails>
    );
  }

  const { properties } = feature;
  const phoneValue = properties.firmPhone || t`Not added`;
  const linkedinValue = properties.linkedinUrl ? (
    <StyledLink href={properties.linkedinUrl} rel="noreferrer" target="_blank">
      {t`Open LinkedIn`}
    </StyledLink>
  ) : (
    t`Not added`
  );

  return (
    <StyledDetails
      aria-live="polite"
      aria-label={t`Selected company details`}
      data-testid="territory-company-details"
    >
      <StyledHeadingRow>
        <StyledHeading>{properties.companyName}</StyledHeading>
        {properties.leadStatus ? (
          <StyledStatus>{properties.leadStatus}</StyledStatus>
        ) : null}
      </StyledHeadingRow>
      <StyledDetailsGrid>
        <DetailRow label={t`Wholesaler`} value={properties.ownerName} />
        <DetailRow
          label={t`Territory`}
          value={properties.ownerTerritory || t`Not assigned`}
        />
        <DetailRow
          label={t`Phone`}
          value={
            properties.firmPhone ? (
              <StyledLink href={`tel:${properties.firmPhone}`}>
                {phoneValue}
              </StyledLink>
            ) : (
              phoneValue
            )
          }
        />
        <DetailRow
          label={t`Location`}
          value={properties.locationLabel || t`Not added`}
        />
        <DetailRow label={t`State`} value={properties.state || t`Not added`} />
        <DetailRow label={t`ZIP`} value={properties.postcode || t`Not added`} />
        <DetailRow
          label={t`Address`}
          value={properties.fullAddress || t`Not added`}
        />
        <DetailRow label={t`LinkedIn`} value={linkedinValue} />
      </StyledDetailsGrid>
      <div>
        <StyledLabel>{t`Notes`}</StyledLabel>
        <StyledNotes>{properties.notes || t`No notes yet.`}</StyledNotes>
      </div>
      <LightButton
        title={t`Open full company record`}
        onClick={() => onCompanyOpen(properties.companyId)}
      />
    </StyledDetails>
  );
};

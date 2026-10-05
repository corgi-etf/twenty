import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledBadge = styled.span`
  border-radius: 4px;
  padding: 2px 6px;
  color: ${themeCssVariables.tag.text.green};
  background: ${themeCssVariables.tag.background.green};
  white-space: nowrap;
`;
export const CorgiClientBadge = ({ active }: { active: boolean }) =>
  active ? (
    <StyledBadge>
      <Trans>Active client</Trans>
    </StyledBadge>
  ) : (
    <span>
      <Trans>Not marked active</Trans>
    </span>
  );

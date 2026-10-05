import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledBadge = styled.span`
  background: ${themeCssVariables.tag.background.green};
  border-radius: 4px;
  color: ${themeCssVariables.tag.text.green};
  padding: 2px 6px;
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

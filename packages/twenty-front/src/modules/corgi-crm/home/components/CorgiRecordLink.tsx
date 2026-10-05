import { type CorgiRecordLink as CorgiRecordLinkType } from '@/corgi-crm/types/CorgiHome';
import { getCorgiRecordPath } from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledLink = styled(Link)`
  color: ${themeCssVariables.font.color.primary};
  font-weight: 500;
  overflow-wrap: anywhere;
  text-decoration: none;
  &:hover {
    color: ${themeCssVariables.color.blue};
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 2px;
  }
`;

export const CorgiRecordLink = ({
  record,
}: {
  record: CorgiRecordLinkType;
}) => <StyledLink to={getCorgiRecordPath(record)}>{record.label}</StyledLink>;

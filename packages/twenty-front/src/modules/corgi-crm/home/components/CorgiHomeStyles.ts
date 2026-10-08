import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledCorgiPanel = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  min-width: 0;
  padding: 20px;
`;
export const StyledCorgiHeading = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 14px;
`;
export const StyledCorgiMuted = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12px;
`;
export const StyledCorgiRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: 10px;
  justify-content: space-between;
  padding: 10px 0;
  &:last-child {
    border-bottom: 0;
  }
`;
export const StyledCorgiStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
`;
export const StyledCorgiActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
export const StyledCorgiButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 8px 10px;
  &:hover {
    background: ${themeCssVariables.background.secondary};
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 2px;
  }
  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;
export const StyledCorgiInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-width: 0;
  padding: 8px 10px;
`;
export const StyledCorgiSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  padding: 8px;
`;
export const StyledCorgiBadge = styled.span`
  background: ${themeCssVariables.background.secondary};
  border-radius: 4px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-block;
  font-size: 11px;
  padding: 3px 6px;
  &[data-kind='meeting-booked'],
  &[data-kind='meetingBooking'] {
    background: ${themeCssVariables.tag.background.blue};
    color: ${themeCssVariables.tag.text.blue};
  }
  &[data-kind='meeting-taken'],
  &[data-kind='companyAllocation'] {
    background: ${themeCssVariables.tag.background.green};
    color: ${themeCssVariables.tag.text.green};
  }
  &[data-kind='allocation-logged'] {
    background: ${themeCssVariables.tag.background.orange};
    color: ${themeCssVariables.tag.text.orange};
  }
  &[data-kind='outreachActivity'] {
    background: ${themeCssVariables.tag.background.purple};
    color: ${themeCssVariables.tag.text.purple};
  }
  &[data-kind='company'],
  &[data-kind='person'] {
    background: ${themeCssVariables.tag.background.turquoise};
    color: ${themeCssVariables.tag.text.turquoise};
  }
  &[data-kind='overdue'] {
    background: ${themeCssVariables.tag.background.red};
    color: ${themeCssVariables.tag.text.red};
  }
  &[data-kind='due-today'] {
    background: ${themeCssVariables.tag.background.orange};
    color: ${themeCssVariables.tag.text.orange};
  }
`;

// The header links sat on the default link blue, which is illegible against the
// dark theme's background. Render them as a surfaced box using the same tokens
// as the other controls, so contrast holds in both themes instead of depending
// on the link colour.
export const StyledCorgiHeaderLink = styled.span`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: inline-block;
  padding: 2px 8px;
  a {
    color: ${themeCssVariables.font.color.primary};
    font-weight: ${themeCssVariables.font.weight.medium};
    text-decoration: none;
  }
  a:hover,
  a:focus-visible {
    text-decoration: underline;
  }
`;

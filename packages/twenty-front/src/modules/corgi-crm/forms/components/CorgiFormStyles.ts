import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledCorgiFormField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

// The required marker is drawn in CSS so it stays out of the accessible name.
export const StyledCorgiFormLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  &[data-required='true']::after {
    color: ${themeCssVariables.font.color.danger};
    content: ' *';
  }
`;

export const StyledCorgiFormGroup = styled.fieldset`
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  min-width: 0;
  padding: 0;
`;

export const StyledCorgiFormLegend = styled.legend`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin-bottom: 8px;
  padding: 0;
  &[data-required='true']::after {
    color: ${themeCssVariables.font.color.danger};
    content: ' *';
  }
`;

export const StyledCorgiFormRow = styled.div`
  display: grid;
  gap: 10px 12px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
`;

export const StyledCorgiFormCheckbox = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  gap: 8px;
  min-width: 0;
`;

export const StyledCorgiFormOptionGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
`;

export const StyledCorgiFormOption = styled.label`
  align-items: center;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  gap: 10px;
  min-height: 36px;
  padding: 0 12px;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
  &:has(input:checked) {
    background: ${themeCssVariables.accent.quaternary};
    border-color: ${themeCssVariables.color.blue};
  }
  &:has(input:focus-visible) {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

export const StyledCorgiFormButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: 6px;
  height: 32px;
  justify-content: center;
  padding: 0 14px;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    opacity 120ms ease;
  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.transparent.light};
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 2px;
  }
  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
`;

export const StyledCorgiFormPrimaryButton = styled(StyledCorgiFormButton)`
  background: ${themeCssVariables.background.invertedPrimary};
  border-color: ${themeCssVariables.background.invertedPrimary};
  color: ${themeCssVariables.font.color.inverted};
  min-width: 88px;
  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.invertedSecondary};
  }
`;

export const StyledCorgiFormTextButton = styled.button`
  background: transparent;
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  padding: 4px 6px;
  transition:
    background-color 120ms ease,
    color 120ms ease;
  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

export const StyledCorgiFormHint = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

export const StyledCorgiFormNotice = styled.p`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.45;
  margin: 0;
  padding: 8px 12px;
  &[role='alert'] {
    background: ${themeCssVariables.background.transparent.danger};
    border-color: ${themeCssVariables.border.color.danger};
    color: ${themeCssVariables.font.color.danger};
  }
  &[role='status'] {
    background: ${themeCssVariables.background.transparent.orange};
    border-color: ${themeCssVariables.tag.background.orange};
    color: ${themeCssVariables.tag.text.orange};
  }
`;

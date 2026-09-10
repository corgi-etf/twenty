import { BUSINESS_DEVELOPMENT_REPRESENTATIVE_WHOLESALER_ROLE } from 'src/constants';

const NORMALIZED_BUSINESS_DEVELOPMENT_REPRESENTATIVE_ROLE =
  BUSINESS_DEVELOPMENT_REPRESENTATIVE_WHOLESALER_ROLE.trim().toLowerCase();

// Role is free text a person types, so the same role reaches this app as 'BDR',
// ' bdr ', or 'Bdr'. Only an exact normalized match identifies the role: an
// empty value, the legacy 'Wholesaler' default every record still carries, or
// any word this app has never been taught must stay unidentified so a rule
// keyed on a role can never fire on a guess.
export const isBusinessDevelopmentRepresentativeRole = (
  role: string | null | undefined,
): boolean =>
  typeof role === 'string' &&
  role.trim().toLowerCase() ===
    NORMALIZED_BUSINESS_DEVELOPMENT_REPRESENTATIVE_ROLE;

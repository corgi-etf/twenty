import { type WorkspaceMemberIdentity } from 'src/modules/wholesaler/onboarding/types';

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

const normalizeNamePart = (value?: string | null): string =>
  value?.trim().replace(/\s+/g, ' ') ?? '';

export const normalizeMemberName = (
  member: WorkspaceMemberIdentity,
): string => {
  const fullName = [member.firstName, member.lastName]
    .map(normalizeNamePart)
    .filter(Boolean)
    .join(' ');

  return fullName || normalizeEmail(member.email).split('@')[0] || 'Wholesaler';
};

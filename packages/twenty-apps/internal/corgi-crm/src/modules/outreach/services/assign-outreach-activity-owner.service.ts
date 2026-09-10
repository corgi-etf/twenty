import { type OutreachActivityOwnerRepository } from 'src/modules/outreach/types';
import { type WholesalerRepository } from 'src/modules/wholesaler/onboarding/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ASSIGN_OUTREACH_ACTIVITY_OWNER_SKIP_REASONS = [
  'activity_not_found',
  'already_assigned',
  'unknown_creator',
  'creator_has_no_wholesaler',
  'ambiguous_creator_wholesaler',
] as const;

export type AssignOutreachActivityOwnerSkipReason =
  (typeof ASSIGN_OUTREACH_ACTIVITY_OWNER_SKIP_REASONS)[number];

export type AssignOutreachActivityOwnerResult =
  | { status: 'assigned'; activityId: string; wholesalerId: string }
  | {
      status: 'skipped';
      activityId: string;
      reason: AssignOutreachActivityOwnerSkipReason;
    };

export const assignOutreachActivityOwner = async ({
  activityId,
  creatorWorkspaceMemberId,
  activityRepository,
  wholesalerRepository,
}: {
  activityId: string;
  creatorWorkspaceMemberId: string | null;
  activityRepository: OutreachActivityOwnerRepository;
  wholesalerRepository: Pick<WholesalerRepository, 'findByWorkspaceMemberId'>;
}): Promise<AssignOutreachActivityOwnerResult> => {
  const record = await activityRepository.getActivityOwner(activityId);
  if (!record) {
    return { status: 'skipped', activityId, reason: 'activity_not_found' };
  }
  // A wholesaler someone chose always wins. A re-delivered create event must
  // read the record as it is now, never as the event described it.
  if (record.wholesalerId) {
    return { status: 'skipped', activityId, reason: 'already_assigned' };
  }
  if (
    !creatorWorkspaceMemberId ||
    !UUID_PATTERN.test(creatorWorkspaceMemberId)
  ) {
    return { status: 'skipped', activityId, reason: 'unknown_creator' };
  }

  const wholesalers = (
    await wholesalerRepository.findByWorkspaceMemberId(creatorWorkspaceMemberId)
  ).filter(
    (wholesaler) => wholesaler.workspaceMemberId === creatorWorkspaceMemberId,
  );
  if (wholesalers.length === 0) {
    return {
      status: 'skipped',
      activityId,
      reason: 'creator_has_no_wholesaler',
    };
  }
  if (wholesalers.length > 1) {
    // Fail closed: onboarding reconciliation keeps this one-to-one, so a
    // duplicate link is a data fault to repair, not an owner to guess.
    return {
      status: 'skipped',
      activityId,
      reason: 'ambiguous_creator_wholesaler',
    };
  }

  const wholesalerId = wholesalers[0]!.id;
  const assigned = await activityRepository.assignUnassignedActivityOwner({
    id: activityId,
    wholesalerId,
  });
  if (assigned) return { status: 'assigned', activityId, wholesalerId };

  const persisted = await activityRepository.getActivityOwner(activityId);
  if (persisted?.wholesalerId) {
    return { status: 'skipped', activityId, reason: 'already_assigned' };
  }
  throw new Error('Outreach activity owner assignment did not persist');
};

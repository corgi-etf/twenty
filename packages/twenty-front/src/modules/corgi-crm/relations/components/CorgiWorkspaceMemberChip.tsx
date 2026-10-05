import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import {
  RecordChip,
  type RecordChipProps,
} from '@/object-record/components/RecordChip';
import { useLingui } from '@lingui/react/macro';

export const CorgiWorkspaceMemberChip = (props: RecordChipProps) => {
  const { t } = useLingui();
  const { records, loading, error } = useFindManyRecords({
    objectNameSingular: 'wholesaler',
    filter: { workspaceMemberId: { eq: props.record.id } },
    limit: 2,
    recordGqlFields: { id: true, name: true },
  });
  if (!loading && !error && records.length === 1)
    return (
      <RecordChip
        {...props}
        objectNameSingular="wholesaler"
        record={records[0]}
      />
    );
  return (
    <span
      title={
        loading
          ? t`Loading profile`
          : records.length > 1
            ? t`Multiple wholesaler profiles are linked. Ask an administrator to resolve the mapping.`
            : t`No accessible wholesaler profile is linked.`
      }
    >
      <RecordChip {...props} forceDisableClick />
    </span>
  );
};

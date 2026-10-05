import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import {
  RecordChip,
  type RecordChipProps,
} from '@/object-record/components/RecordChip';
import { useLingui } from '@lingui/react/macro';

type CorgiWorkspaceMemberChipProps = RecordChipProps;

export const CorgiWorkspaceMemberChip = (
  props: CorgiWorkspaceMemberChipProps,
) => {
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
        className={props.className}
        variant={props.variant}
        isBold={props.isBold}
        maxWidth={props.maxWidth}
        to={props.to}
        size={props.size}
        isLabelHidden={props.isLabelHidden}
        isIconHidden={props.isIconHidden}
        triggerEvent={props.triggerEvent}
        onClick={props.onClick}
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
      <RecordChip
        objectNameSingular={props.objectNameSingular}
        record={props.record}
        className={props.className}
        variant={props.variant}
        isBold={props.isBold}
        maxWidth={props.maxWidth}
        to={props.to}
        size={props.size}
        isLabelHidden={props.isLabelHidden}
        isIconHidden={props.isIconHidden}
        triggerEvent={props.triggerEvent}
        onClick={props.onClick}
        forceDisableClick
      />
    </span>
  );
};

import { formatCorgiMoney } from '@/corgi-crm/utils/corgiHomePresentation';
import { CorgiCompanyTypeBadge } from '@/corgi-crm/profiles/components/CorgiCompanyTypeBadge';
import { CorgiCompanyOwners } from '@/corgi-crm/profiles/components/CorgiCompanyOwners';
import { useState } from 'react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { v4 } from 'uuid';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { RecordChip } from '@/object-record/components/RecordChip';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useCorgiCreateRecordDialog } from '@/corgi-crm/forms/hooks/useCorgiCreateRecordDialog';
import { CorgiClientBadge } from '@/corgi-crm/profiles/components/CorgiClientBadge';
import { CorgiFollowUpCompanies } from '@/corgi-crm/home/components/CorgiFollowUpCompanies';
import { CorgiTeamPerformance } from '@/corgi-crm/home/components/CorgiTeamPerformance';
import { CorgiActivityTrends } from '@/corgi-crm/home/components/CorgiActivityTrends';
import { CorgiPersonScoreboard } from '@/corgi-crm/profiles/components/CorgiPersonScoreboard';
import { stopCorgiInputKeyCapture } from '@/corgi-crm/utils/stopCorgiInputKeyCapture';

const StyledOverview = styled.section`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  section {
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 8px;
    padding: 12px;
  }
  h2,
  h3 {
    margin: 0 0 8px;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
  }
  button {
    cursor: pointer;
  }
`;

type CorgiRelatedRecordsProps = {
  objectNameSingular: string;
  fieldName: string;
  recordId: string;
  title: string;
};
const CorgiRelatedRecords = ({
  objectNameSingular,
  fieldName,
  recordId,
  title,
}: CorgiRelatedRecordsProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { objectMetadataItem } = useObjectMetadataItem({ objectNameSingular });
  const permission = useObjectPermissionsForObject(objectMetadataItem.id);
  const { records, totalCount, loading, error, hasNextPage, fetchMoreRecords } =
    useFindManyRecords({
      objectNameSingular,
      filter: { [`${fieldName}Id`]: { eq: recordId } },
      limit: 10,
      skip: !isExpanded || !permission.canReadObjectRecords,
    });
  return (
    <section>
      <h3>
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {title}
          {isExpanded && totalCount !== undefined ? ` (${totalCount})` : ''}
        </button>
      </h3>
      {isExpanded && (
        <>
          {!permission.canReadObjectRecords ? (
            <p>
              <Trans>You do not have access to these records.</Trans>
            </p>
          ) : error ? (
            <p role="alert">
              <Trans>Records unavailable. Try again.</Trans>
            </p>
          ) : loading ? (
            <p role="status">
              <Trans>Loading…</Trans>
            </p>
          ) : records.length === 0 ? (
            <p>
              <Trans>No records yet.</Trans>
            </p>
          ) : (
            <ul>
              {records.map((record) => {
                const ownerCompany =
                  objectNameSingular === 'companyOwnership'
                    ? record.company
                    : undefined;
                const linkedRecord = ownerCompany ?? record;
                const linkedObject = ownerCompany
                  ? 'company'
                  : objectNameSingular;
                return (
                  <li key={record.id}>
                    <RecordChip
                      objectNameSingular={linkedObject}
                      record={linkedRecord}
                    />
                    {linkedRecord.activeClient === true && (
                      <CorgiClientBadge active />
                    )}
                    {record.company && !ownerCompany && (
                      <RecordChip
                        objectNameSingular="company"
                        record={record.company}
                      />
                    )}
                    {record.contact && (
                      <RecordChip
                        objectNameSingular="person"
                        record={record.contact}
                      />
                    )}
                    {record.amount?.currencyCode && (
                      <span>
                        {formatCorgiMoney([
                          {
                            currencyCode: record.amount.currencyCode,
                            amountMicros: String(
                              record.amount.amountMicros ?? 0,
                            ),
                          },
                        ])}
                      </span>
                    )}
                    {record.occurredAt && (
                      <time dateTime={record.occurredAt}>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeZone: 'America/Chicago',
                        }).format(new Date(record.occurredAt))}
                      </time>
                    )}
                    {record.status && <span>{record.status}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {hasNextPage && (
            <button type="button" onClick={() => void fetchMoreRecords()}>
              <Trans>Load more</Trans>
            </button>
          )}
        </>
      )}
    </section>
  );
};

type CorgiProfileOverviewProps = {
  objectNameSingular: string;
  record: ObjectRecord;
};
type ReadyCorgiProfileOverviewProps = CorgiProfileOverviewProps;
const ReadyCorgiProfileOverview = ({
  objectNameSingular,
  record,
}: ReadyCorgiProfileOverviewProps) => {
  const { t } = useLingui();
  const { objectMetadataItem } = useObjectMetadataItem({ objectNameSingular });
  const { objectMetadataItems } = useObjectMetadataItems();
  const { openCreateRecord } = useCorgiCreateRecordDialog();
  const { updateOneRecord } = useUpdateOneRecord();
  const [error, setError] = useState<string>();
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  const canReadField = (name: string) => {
    const field = objectMetadataItem.fields.find((item) => item.name === name);
    return (
      Boolean(field) &&
      permissions.restrictedFields?.[field!.id]?.canRead !== false
    );
  };
  const canUpdateField = (name: string) => {
    const field = objectMetadataItem.fields.find((item) => item.name === name);
    return (
      Boolean(field) &&
      permissions.canUpdateObjectRecords &&
      permissions.restrictedFields?.[field!.id]?.canUpdate !== false
    );
  };
  const companyId =
    objectNameSingular === 'company'
      ? record.id
      : (record.companyId ?? record.company?.id);
  const contactId =
    objectNameSingular === 'person'
      ? record.id
      : (record.contactId ?? record.contact?.id);
  const initialValues = {
    ...(companyId ? { companyId } : {}),
    ...(contactId ? { contactId } : {}),
    ...(objectNameSingular === 'wholesaler'
      ? { wholesalerId: record.id, externalWholesalerId: record.id }
      : {}),
    ...(objectNameSingular === 'meetingBooking'
      ? { meetingId: record.id }
      : {}),
  };
  const workspaceMemberId =
    record.workspaceMemberId ?? record.workspaceMember?.id;
  const hasFollowUps = objectMetadataItems.some(
    ({ nameSingular }) => nameSingular === 'outreachFollowUp',
  );
  const runUpdate = async (input: Record<string, unknown>) => {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await updateOneRecord({
        objectNameSingular,
        idToUpdate: record.id,
        updateOneRecordInput: input,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t`Save failed`);
    } finally {
      setSaving(false);
    }
  };
  const relationTitles: Record<string, string> = {
    outreachActivity: t`Outreach activities`,
    companyOwnership: t`Owners and companies`,
    meetingBooking: t`Meetings`,
    companyAllocation: t`Allocations`,
    leadAssignment: t`Lead assignments`,
    person: t`People`,
    outreachFollowUp: t`Follow-ups`,
  };
  const relations = objectMetadataItem.fields.filter(
    (field) =>
      field.relation?.type === 'ONE_TO_MANY' &&
      !(
        objectNameSingular === 'company' &&
        field.relation.targetObjectMetadata.nameSingular === 'companyOwnership'
      ) &&
      Boolean(relationTitles[field.relation.targetObjectMetadata.nameSingular]),
  );
  return (
    <StyledOverview aria-label={t`Profile overview`}>
      {error && <p role="alert">{error}</p>}
      <nav aria-label={t`Related actions`}>
        {[
          ['outreachActivity', t`Log activity`],
          ['meetingBooking', t`Book meeting`],
          ['companyAllocation', t`Record allocation`],
          ...(objectNameSingular === 'company'
            ? [['person', t`Create contact`]]
            : []),
        ]
          .filter(([name]) =>
            objectMetadataItems.some(
              ({ nameSingular }) => nameSingular === name,
            ),
          )
          .map(([name, label]) => (
            <button
              key={name}
              type="button"
              onClick={() =>
                void openCreateRecord({
                  objectNameSingular: name,
                  initialValues,
                })
              }
            >
              {label}
            </button>
          ))}
      </nav>
      {canReadField('activeClient') && (
        <div>
          <CorgiClientBadge active={record.activeClient === true} />{' '}
          <button
            type="button"
            disabled={saving || !canUpdateField('activeClient')}
            onClick={() =>
              void runUpdate({ activeClient: record.activeClient !== true })
            }
          >
            {record.activeClient ? t`Mark not active` : t`Mark active client`}
          </button>
        </div>
      )}
      {objectNameSingular === 'company' &&
        canReadField('firmType') &&
        typeof record.firmType === 'string' &&
        record.firmType.trim() && (
          <div>
            <Trans>Company type:</Trans>{' '}
            <CorgiCompanyTypeBadge value={record.firmType} />
          </div>
        )}
      {record.territory && (
        <p>
          <Trans>Territory:</Trans> {record.territory}
        </p>
      )}
      {typeof record.notes === 'string' && record.notes && (
        <section>
          <h3>
            <Trans>Notes</Trans>
          </h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{record.notes}</p>
        </section>
      )}
      {objectNameSingular === 'meetingBooking' &&
        objectMetadataItem.fields.some(({ name }) => name === 'heldAt') &&
        record.status !== 'COMPLETED' && (
          <button
            type="button"
            disabled={
              saving || !canUpdateField('heldAt') || !canUpdateField('status')
            }
            onClick={() =>
              void runUpdate({
                status: 'COMPLETED',
                heldAt: new Date().toISOString(),
              })
            }
          >
            <Trans>Mark taken now</Trans>
          </button>
        )}
      {objectNameSingular === 'outreachActivity' && hasFollowUps && (
        <section>
          <h3>
            <Trans>Schedule follow-up</Trans>
          </h3>
          <p>
            <Trans>
              Assigned to me. Your existing activity owner and other assignments
              are preserved.
            </Trans>
          </p>
          <input
            aria-label={t`Follow-up date`}
            type="date"
            value={dueDate}
            onKeyDown={stopCorgiInputKeyCapture}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <button
            type="button"
            disabled={
              saving ||
              !dueDate ||
              !canUpdateField('followUpDate') ||
              !canUpdateField('followUpRequestKey')
            }
            onClick={() =>
              void runUpdate({
                followUpDate: dueDate,
                followUpRequestKey: v4(),
              })
            }
          >
            <Trans>Save</Trans>
          </button>
        </section>
      )}
      {/* Scoped by the wholesaler record, so every wholesaler reports their own
          work whether or not they have a login. Gating this on a workspace
          member hid the figures for most of them. Also not gated on the
          follow-up object: when that is missing the profile showed nothing. */}
      {objectNameSingular === 'wholesaler' && (
        <CorgiPersonScoreboard creditedWholesalerId={record.id} />
      )}
      {objectNameSingular === 'wholesaler' &&
        workspaceMemberId &&
        hasFollowUps && (
          <>
            <CorgiTeamPerformance workspaceMemberId={workspaceMemberId} />
            <CorgiActivityTrends workspaceMemberId={workspaceMemberId} />
            <CorgiFollowUpCompanies workspaceMemberId={workspaceMemberId} />
          </>
        )}
      {objectNameSingular === 'wholesaler' && !workspaceMemberId && (
        <p>
          <Trans>
            No workspace member is linked. An administrator can link this
            profile to show personal statistics and follow-up companies.
          </Trans>
        </p>
      )}
      {objectNameSingular === 'company' &&
        objectMetadataItems.some(
          ({ nameSingular }) => nameSingular === 'companyOwnership',
        ) && <CorgiCompanyOwners companyId={record.id} />}
      {relations.map((field) => (
        <CorgiRelatedRecords
          key={field.id}
          title={
            relationTitles[field.relation!.targetObjectMetadata.nameSingular]
          }
          objectNameSingular={field.relation!.targetObjectMetadata.nameSingular}
          fieldName={field.relation!.targetFieldMetadata.name}
          recordId={record.id}
        />
      ))}
    </StyledOverview>
  );
};

export const CorgiProfileOverview = (props: CorgiProfileOverviewProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  if (
    !objectMetadataItems.some(
      ({ nameSingular }) => nameSingular === 'outreachActivity',
    ) ||
    ![
      'company',
      'person',
      'wholesaler',
      'outreachActivity',
      'meetingBooking',
      'companyAllocation',
    ].includes(props.objectNameSingular)
  )
    return null;
  return (
    <ReadyCorgiProfileOverview
      objectNameSingular={props.objectNameSingular}
      record={props.record}
    />
  );
};

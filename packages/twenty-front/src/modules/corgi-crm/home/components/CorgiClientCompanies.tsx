import {
  StyledCorgiHeading,
  StyledCorgiMuted,
  StyledCorgiRow,
  StyledCorgiStack,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import {
  type CorgiAllocationAttribution,
  type CorgiClientCompany,
} from '@/corgi-crm/types/CorgiHome';
import {
  formatCorgiDateTime,
  formatCorgiMoney,
  getCorgiDrilldownPath,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router-dom';

export const CorgiClientCompanies = ({
  clients,
}: {
  clients: CorgiClientCompany[];
}) => (
  <>
    {clients.map((client) => (
      <StyledCorgiRow key={client.company.id}>
        <StyledCorgiStack>
          <details>
            <summary>
              <CorgiRecordLink record={client.company} /> ·{' '}
              {client.allocationCount} <Trans>allocations</Trans> ·{' '}
              {formatCorgiMoney(client.amounts)}
            </summary>
            <StyledCorgiStack>
              <StyledCorgiMuted>
                <Trans>Last allocation</Trans>:{' '}
                {formatCorgiDateTime(client.lastAllocationAt)}
              </StyledCorgiMuted>
              <Link
                to={getCorgiDrilldownPath({
                  section: 'allocations',
                  companyId: client.company.id,
                  allTime: 'true',
                })}
              >
                <Trans>View all company allocations</Trans>
              </Link>
              <StyledCorgiHeading>
                <Trans>Credited salesperson / wholesaler</Trans>
              </StyledCorgiHeading>
              <CorgiAllocationAttributions
                attributions={client.creditedWholesalers}
                companyId={client.company.id}
                attribution="creditedWholesalerId"
              />
              <StyledCorgiHeading>
                <Trans>Client contact</Trans>
              </StyledCorgiHeading>
              <CorgiAllocationAttributions
                attributions={client.contacts}
                companyId={client.company.id}
                attribution="contactId"
              />
            </StyledCorgiStack>
          </details>
        </StyledCorgiStack>
      </StyledCorgiRow>
    ))}
  </>
);

const CorgiAllocationAttributions = ({
  attributions,
  companyId,
  attribution,
}: {
  attributions: CorgiAllocationAttribution[];
  companyId: string;
  attribution: 'creditedWholesalerId' | 'contactId';
}) => (
  <>
    {attributions.map((entry) => (
      <StyledCorgiRow
        key={entry.person?.id ?? entry.attributionStatus ?? 'unassigned'}
      >
        <span>
          {entry.person ? (
            <CorgiRecordLink record={entry.person} />
          ) : entry.attributionStatus === 'restricted' ? (
            t`Unavailable person`
          ) : (
            t`Unassigned`
          )}
        </span>
        {entry.attributionStatus === 'restricted' ? (
          <span>
            {entry.allocationCount} · {formatCorgiMoney(entry.amounts)}
          </span>
        ) : (
          <Link
            to={getCorgiDrilldownPath({
              section: 'allocations',
              companyId,
              allTime: 'true',
              [attribution]: entry.person?.id ?? 'unassigned',
            })}
          >
            {entry.allocationCount} · {formatCorgiMoney(entry.amounts)}
          </Link>
        )}
      </StyledCorgiRow>
    ))}
  </>
);

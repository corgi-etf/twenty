import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  type LifecycleRepository,
  type LifecycleRecord,
} from 'src/modules/experience/services/reconcile-lifecycle.service';
const selectionFor = (object: string) =>
  object === 'companyAllocation'
    ? 'ticker amount {amountMicros currencyCode} loggedAt loggedById allocationValidationMessage meetingId meeting {companyId}'
    : 'status heldAt heldRecordedAt takenById wholesalerId bookingValidationMessage';
export class CoreLifecycleRepository implements LifecycleRepository {
  public constructor(
    private readonly transport: Pick<RawCoreGraphqlTransport, 'request'>,
  ) {}
  public async get(
    object: 'meetingBooking' | 'companyAllocation',
    id: string,
  ): Promise<LifecycleRecord | null> {
    const result = await this.transport.request<
      Record<
        string,
        LifecycleRecord & {
          contact: { companyId: string | null } | null;
          meeting?: { companyId: string | null } | null;
          allocationValidationMessage?: string | null;
          bookingValidationMessage?: string | null;
        }
      >,
      { id: string }
    >({
      operationName: 'CorgiLifecycleRead',
      document: `query CorgiLifecycleRead($id:UUID!){${object}(filter:{id:{eq:$id}}){id createdAt updatedAt companyId contactId contact {companyId} ${selectionFor(object)}}}`,
      variables: { id },
    });
    const row = result[object];
    return row
      ? {
          ...row,
          contactCompanyId: row.contact?.companyId ?? null,
          meetingCompanyId: row.meeting?.companyId ?? null,
          validationMessage:
            object === 'companyAllocation'
              ? row.allocationValidationMessage
              : row.bookingValidationMessage,
        }
      : null;
  }
  public async update(
    object: 'meetingBooking' | 'companyAllocation',
    record: LifecycleRecord,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const type = object[0]!.toUpperCase() + object.slice(1);
    const operation = `update${type}s`;
    try {
      const result = await this.transport.request<
        Record<string, { id: string }[]>,
        { filter: Record<string, unknown>; data: Record<string, unknown> }
      >({
        operationName: 'CorgiLifecycleStamp',
        document: `mutation CorgiLifecycleStamp($filter:${type}FilterInput!,$data:${type}UpdateInput!){${operation}(filter:$filter,data:$data){id}}`,
        variables: {
          filter: {
            and: [
              { id: { eq: record.id } },
              { updatedAt: { eq: record.updatedAt } },
            ],
          },
          data,
        },
      });
      if (result[operation]?.some((row) => row.id === record.id)) return true;
    } catch {
      /* Confirm a committed write after a lost response. */
    }
    const saved = await this.get(object, record.id);
    return (
      saved !== null &&
      Object.entries(data).every(([key, value]) =>
        key.endsWith('ValidationMessage')
          ? saved.validationMessage === value
          : saved[key as keyof LifecycleRecord] === value,
      )
    );
  }
}

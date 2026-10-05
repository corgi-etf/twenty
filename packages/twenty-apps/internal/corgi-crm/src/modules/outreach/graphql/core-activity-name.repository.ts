import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  type ActivityNameRepository,
  type ActivityNameSource,
} from 'src/modules/outreach/services/activity-name.service';

export class CoreActivityNameRepository implements ActivityNameRepository {
  public constructor(
    private readonly transport: Pick<RawCoreGraphqlTransport, 'request'>,
  ) {}
  public async get(id: string): Promise<ActivityNameSource | null> {
    const result = await this.transport.request<
      {
        outreachActivity:
          | null
          | (Omit<
              ActivityNameSource,
              'companyName' | 'contactCompanyId' | 'contactCompanyName'
            > & {
              company: { name: string } | null;
              contact: { company: { id: string; name: string } | null } | null;
            });
      },
      { id: string }
    >({
      operationName: 'CorgiActivityNameSource',
      document: `query CorgiActivityNameSource($id: UUID!) { outreachActivity(filter:{id:{eq:$id}}) { id name managedName activityType companyId company {name} contact {company {id name}} occurredAt createdAt updatedAt } }`,
      variables: { id },
    });
    const record = result.outreachActivity;
    return record
      ? {
          ...record,
          companyName: record.company?.name ?? null,
          contactCompanyId: record.contact?.company?.id ?? null,
          contactCompanyName: record.contact?.company?.name ?? null,
        }
      : null;
  }
  public async update(
    input: Parameters<ActivityNameRepository['update']>[0],
  ): Promise<boolean> {
    const { id, expectedUpdatedAt, ...data } = input;
    try {
      const result = await this.transport.request<
        {
          updateOutreachActivities: {
            id: string;
            name: string;
            managedName: string;
          }[];
        },
        { filter: Record<string, unknown>; data: typeof data }
      >({
        operationName: 'CorgiReconcileActivityName',
        document: `mutation CorgiReconcileActivityName($filter:OutreachActivityFilterInput!, $data:OutreachActivityUpdateInput!) { updateOutreachActivities(filter:$filter,data:$data) {id name managedName} }`,
        variables: {
          filter: {
            and: [{ id: { eq: id } }, { updatedAt: { eq: expectedUpdatedAt } }],
          },
          data,
        },
      });
      if (
        result.updateOutreachActivities.some(
          (row) =>
            row.id === id &&
            row.name === data.name &&
            row.managedName === data.managedName,
        )
      )
        return true;
    } catch {
      /* Exact readback also handles a committed write with a lost response. */
    }
    const saved = await this.get(id);
    return (
      saved?.name === data.name &&
      saved.managedName === data.managedName &&
      (!data.companyId || saved.companyId === data.companyId)
    );
  }
}

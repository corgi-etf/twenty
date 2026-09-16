import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  type FollowUpSource,
  type FollowUpTaskRepository,
} from 'src/modules/outreach/services/create-follow-up-task.service';

type RawCoreRequester = Pick<RawCoreGraphqlTransport, 'request'>;

const FIND_FOLLOW_UP_SOURCE_DOCUMENT = `
  query CorgiFindFollowUpSource($id: UUID!) {
    outreachActivity(filter: { id: { eq: $id } }) {
      id
      followUpDate
      followUpTaskId
      companyId
      wholesalerId
      notes
    }
  }
`;

const FIND_WHOLESALER_MEMBER_DOCUMENT = `
  query CorgiFindWholesalerMember($id: UUID!) {
    wholesaler(filter: { id: { eq: $id } }) {
      id
      workspaceMemberId
    }
  }
`;

const CREATE_FOLLOW_UP_TASK_DOCUMENT = `
  mutation CorgiCreateFollowUpTask($data: TaskCreateInput!) {
    createTask(data: $data) {
      id
    }
  }
`;

const LINK_FOLLOW_UP_TASK_DOCUMENT = `
  mutation CorgiLinkFollowUpTask($data: TaskTargetCreateInput!) {
    createTaskTarget(data: $data) {
      id
    }
  }
`;

const ATTACH_FOLLOW_UP_TASK_DOCUMENT = `
  mutation CorgiAttachFollowUpTask($id: UUID!, $data: OutreachActivityUpdateInput!) {
    updateOutreachActivity(id: $id, data: $data) {
      id
      followUpTaskId
    }
  }
`;

const optionalString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : null;

export class CoreFollowUpTaskRepository implements FollowUpTaskRepository {
  public constructor(private readonly rawTransport: RawCoreRequester) {}

  public async getFollowUpSource(
    activityId: string,
  ): Promise<FollowUpSource | null> {
    const result = await this.rawTransport.request<
      { outreachActivity?: Record<string, unknown> | null },
      { id: string }
    >({
      operationName: 'CorgiFindFollowUpSource',
      document: FIND_FOLLOW_UP_SOURCE_DOCUMENT,
      variables: { id: activityId },
    });
    const node = result.outreachActivity;
    if (!node || typeof node.id !== 'string') return null;
    return {
      id: node.id,
      followUpDate: optionalString(node.followUpDate),
      followUpTaskId: optionalString(node.followUpTaskId),
      companyId: optionalString(node.companyId),
      wholesalerId: optionalString(node.wholesalerId),
      notes: optionalString(node.notes),
    };
  }

  public async findAssigneeForWholesaler(
    wholesalerId: string,
  ): Promise<string | null> {
    const result = await this.rawTransport.request<
      { wholesaler?: Record<string, unknown> | null },
      { id: string }
    >({
      operationName: 'CorgiFindWholesalerMember',
      document: FIND_WHOLESALER_MEMBER_DOCUMENT,
      variables: { id: wholesalerId },
    });
    return optionalString(result.wholesaler?.workspaceMemberId);
  }

  public async createTask(input: {
    id: string;
    title: string;
    dueAt: string;
    assigneeId: string;
    wholesalerId: string;
  }): Promise<{ id: string }> {
    const result = await this.rawTransport.request<
      { createTask?: { id?: string } | null },
      { data: Record<string, unknown> }
    >({
      operationName: 'CorgiCreateFollowUpTask',
      document: CREATE_FOLLOW_UP_TASK_DOCUMENT,
      variables: { data: { ...input, status: 'TODO' } },
    });
    if (result.createTask?.id !== input.id) {
      throw new Error('createTask did not return the deterministic id');
    }
    return { id: input.id };
  }

  public async linkTaskToCompany({
    taskId,
    companyId,
  }: {
    taskId: string;
    companyId: string;
  }): Promise<void> {
    await this.rawTransport.request<
      { createTaskTarget?: { id?: string } | null },
      { data: Record<string, unknown> }
    >({
      operationName: 'CorgiLinkFollowUpTask',
      document: LINK_FOLLOW_UP_TASK_DOCUMENT,
      variables: { data: { taskId, targetCompanyId: companyId } },
    });
  }

  public async attachTaskToActivity({
    activityId,
    taskId,
  }: {
    activityId: string;
    taskId: string;
  }): Promise<boolean> {
    const result = await this.rawTransport.request<
      { updateOutreachActivity?: { followUpTaskId?: string | null } | null },
      { id: string; data: Record<string, unknown> }
    >({
      operationName: 'CorgiAttachFollowUpTask',
      document: ATTACH_FOLLOW_UP_TASK_DOCUMENT,
      variables: { id: activityId, data: { followUpTaskId: taskId } },
    });
    return result.updateOutreachActivity?.followUpTaskId === taskId;
  }
}

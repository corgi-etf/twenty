export type CorgiAvailability = 'available' | 'denied' | 'unavailable';

export type CorgiMoney = { currencyCode: string; amountMicros: string };

export type CorgiRecordLink = {
  id: string;
  objectNameSingular: string;
  objectNamePlural: string;
  label: string;
};

export type CorgiBusinessRecord = CorgiRecordLink & {
  createdAt: string;
  createdBy: string | null;
  subtitle?: string;
  status?: string;
  amounts?: CorgiMoney[];
};

export type CorgiPage<TRecord> = {
  status: CorgiAvailability;
  records: TRecord[];
  totalCount: number | null;
  nextCursor: string | null;
};

export type CorgiMetricKey =
  | 'activities'
  | 'meetingsSet'
  | 'meetingsTaken'
  | 'allocations'
  | 'currentClients';

export type CorgiMetric = {
  status: CorgiAvailability;
  count: number | null;
  amounts?: CorgiMoney[];
};

export type CorgiFollowUp = CorgiBusinessRecord & {
  dueAt: string | null;
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  company: CorgiRecordLink | null;
  contact: CorgiRecordLink | null;
  activity: CorgiRecordLink | null;
  reason: string | null;
  canComplete: boolean;
};

export type CorgiFollowUpCompany = {
  company: CorgiRecordLink | null;
  nextDueAt: string | null;
  lastActivityAt: string | null;
  openCount: number;
  totalCount: number;
  reminders: CorgiFollowUp[];
  nextReminderCursor: string | null;
};

export type CorgiMeeting = CorgiBusinessRecord & {
  scheduledAt: string;
  company: CorgiRecordLink | null;
  contact: CorgiRecordLink | null;
  owner: CorgiRecordLink | null;
  canMarkTaken: boolean;
};

export type CorgiTeamMember = {
  workspaceMemberId: string;
  person: CorgiRecordLink | null;
  name: string;
  activities: CorgiMetric;
  meetingsSet: CorgiMetric;
  meetingsTaken: CorgiMetric;
  allocations: CorgiMetric;
  openFollowUps: CorgiMetric;
};

export type CorgiTrendDay = {
  date: string;
  activities: number;
  byType: Record<string, number>;
};

export type CorgiAllocationAttribution = {
  person: CorgiRecordLink | null;
  attributionStatus?: 'unassigned' | 'restricted';
  allocationCount: number;
  amounts: CorgiMoney[];
};

export type CorgiClientCompany = {
  company: CorgiRecordLink;
  allocationCount: number;
  amounts: CorgiMoney[];
  lastAllocationAt: string;
  creditedWholesalers: CorgiAllocationAttribution[];
  contacts: CorgiAllocationAttribution[];
};

export type CorgiWin = {
  id: string;
  kind: 'meeting-booked' | 'meeting-taken' | 'allocation-logged';
  record: CorgiRecordLink;
  actorName: string | null;
  actorWorkspaceMemberId: string | null;
  recordedAt: string;
  effectiveAt: string;
  isCreation: boolean;
};

export type CorgiHomeSummary = {
  enabled: boolean;
  timeZone: string;
  generatedAt: string;
  today: { date: string; metrics: Record<CorgiMetricKey, CorgiMetric> };
  latestRecords: CorgiPage<CorgiBusinessRecord>;
  followUps: CorgiPage<CorgiFollowUp>;
  agenda: CorgiPage<CorgiMeeting>;
  team: CorgiPage<CorgiTeamMember>;
  recentAllocations: CorgiPage<CorgiBusinessRecord>;
  activeClients: CorgiPage<CorgiBusinessRecord>;
  liveWins: CorgiPage<CorgiWin>;
};

export type CorgiHomeQuery = {
  section?:
    | CorgiMetricKey
    | 'followUps'
    | 'followUpCompanies'
    | 'agenda'
    | 'team'
    | 'trends'
    | 'activeClients'
    | 'liveWins'
    | 'latestRecords';
  cursor?: string;
  search?: string;
  workspaceMemberId?: string;
  status?: 'open' | 'completed' | 'all';
  scope?: 'scheduled' | 'assigned';
  companyId?: string;
  allTime?: 'true';
  creditedWholesalerId?: string;
  contactId?: string;
  from?: string;
  to?: string;
};

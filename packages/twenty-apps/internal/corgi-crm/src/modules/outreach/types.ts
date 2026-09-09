export type OutreachActivity = {
  id: string;
  wholesalerId: string;
  wholesalerName: string;
  companyName: string;
  contactName?: string;
  activityType: string;
  outcome: string;
  notes?: string;
  occurredAt: string;
};

export type OutreachActivityWrite = {
  name: string;
  companyId: string;
  contactId?: string;
  wholesalerId: string;
  activityType: string;
  outcome: string;
  notes?: string;
  occurredAt: string;
  followUpDate?: string;
};

export type NamedRecord = { id: string; name: string };

export type OutreachRepository = {
  findCompanies(query: string): Promise<NamedRecord[]>;
  findContacts(companyId: string, query: string): Promise<NamedRecord[]>;
  createActivity(data: OutreachActivityWrite): Promise<{ id: string }>;
  listActivities(input: {
    start: string;
    end: string;
    wholesalerId?: string;
  }): Promise<OutreachActivity[]>;
};

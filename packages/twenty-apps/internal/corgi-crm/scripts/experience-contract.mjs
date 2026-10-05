export const EXPERIENCE_SCHEMA = {
  companyOwnership: {
    fields: {
      name: 'TEXT',
      isPrimary: 'BOOLEAN',
      company: 'RELATION',
      wholesaler: 'RELATION',
    },
    relations: { company: 'company', wholesaler: 'wholesaler' },
    unique: ['company', 'wholesaler'],
  },
  outreachFollowUp: {
    fields: {
      name: 'TEXT',
      dueAt: 'DATE_TIME',
      scheduledAt: 'DATE_TIME',
      occurrenceKey: 'TEXT',
      status: 'SELECT',
      scheduledBy: 'RELATION',
      assignee: 'RELATION',
      wholesaler: 'RELATION',
      company: 'RELATION',
      contact: 'RELATION',
      activity: 'RELATION',
      assignment: 'RELATION',
      task: 'RELATION',
    },
    protected: ['scheduledAt', 'occurrenceKey', 'scheduledBy'],
    relations: {
      scheduledBy: 'workspaceMember',
      assignee: 'workspaceMember',
      wholesaler: 'wholesaler',
      company: 'company',
      contact: 'person',
      activity: 'outreachActivity',
      assignment: 'leadAssignment',
      task: 'task',
    },
    unique: ['occurrenceKey'],
  },
  outreachActivity: {
    fields: {
      managedName: 'TEXT',
      followUpRequestKey: 'TEXT',
      followUpRequestedBy: 'RELATION',
      followUpValidationMessage: 'TEXT',
    },
    protected: [
      'managedName',
      'followUpRequestedBy',
      'followUpValidationMessage',
    ],
    relations: { followUpRequestedBy: 'workspaceMember' },
  },
  meetingBooking: {
    fields: {
      heldAt: 'DATE_TIME',
      heldRecordedAt: 'DATE_TIME',
      takenBy: 'RELATION',
      contact: 'RELATION',
    },
    protected: ['heldRecordedAt'],
    relations: { takenBy: 'workspaceMember', contact: 'person' },
  },
  companyAllocation: {
    fields: {
      loggedAt: 'DATE_TIME',
      loggedBy: 'RELATION',
      contact: 'RELATION',
      allocationValidationMessage: 'TEXT',
    },
    protected: ['loggedAt', 'loggedBy', 'allocationValidationMessage'],
    relations: { loggedBy: 'workspaceMember', contact: 'person' },
  },
};
export const EXPERIENCE_TRIGGERS = [
  [
    '9bfb7c66-2510-5cbd-851e-279bbf382ff2',
    'on-outreach-activity-updated',
    { eventName: 'outreachActivity.updated' },
  ],
  [
    '25564e34-c66b-5cb6-a446-fd1b91d84b4e',
    'on-follow-up-updated',
    {
      eventName: 'outreachFollowUp.updated',
      updatedFields: [
        'status',
        'dueAt',
        'assigneeId',
        'wholesalerId',
        'companyId',
        'name',
      ],
    },
  ],
  [
    '59cfeabc-04c7-5c3a-842e-f6c752b160ec',
    'on-follow-up-task-updated',
    { eventName: 'task.updated', updatedFields: ['status'] },
  ],
  [
    'cb84f713-50d0-5f57-be7e-ebe485f65b2e',
    'company-allocation-lifecycle-created',
    { eventName: 'companyAllocation.created' },
  ],
  [
    'feb59567-ea13-5c52-a579-2e1c95cba702',
    'company-allocation-lifecycle-updated',
    { eventName: 'companyAllocation.updated' },
  ],
  [
    '7b76e023-90b4-5e74-8ee0-827aab679efd',
    'meeting-booking-lifecycle-created',
    { eventName: 'meetingBooking.created' },
  ],
  [
    '40524308-346f-5358-9c46-8871c7936aa7',
    'meeting-booking-lifecycle-updated',
    { eventName: 'meetingBooking.updated' },
  ],
];
const one = (values, predicate, label) => {
  const matches = values.filter(predicate);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label}`);
  return matches[0];
};
export const verifyExperienceSchema = (objects, application) => {
  for (const [name, contract] of Object.entries(EXPERIENCE_SCHEMA)) {
    const object = one(
      objects,
      (row) => row.nameSingular === name && row.isActive === true,
      `${name} object`,
    );
    const fields = new Map();
    for (const [fieldName, type] of Object.entries(contract.fields)) {
      const field = one(
        object.fieldsList ?? [],
        (row) => row.name === fieldName && row.isActive !== false,
        `${name}.${fieldName}`,
      );
      if (field.type !== type)
        throw new Error(`${name}.${fieldName} type does not match`);
      if (
        contract.protected?.includes(fieldName) &&
        (field.writability !== 'APPLICATION' || field.isUIEditable !== false)
      )
        throw new Error(
          `${name}.${fieldName} must remain application protected`,
        );
      if (
        contract.relations?.[fieldName] &&
        field.relation?.targetObjectMetadata?.nameSingular !==
          contract.relations[fieldName]
      )
        throw new Error(`${name}.${fieldName} has an invalid relation target`);
      fields.set(fieldName, field);
    }
    if (contract.unique) {
      const expected = contract.unique
        .map((field) => fields.get(field).id)
        .sort()
        .join(',');
      if (
        !(object.indexMetadataList ?? []).some(
          (index) =>
            index.isUnique === true &&
            (index.indexFieldMetadataList ?? [])
              .map((field) => field.fieldMetadataId)
              .sort()
              .join(',') === expected,
        )
      )
        throw new Error(`${name} is missing its unique identity index`);
    }
  }
  const followUp = objects.find(
    (row) => row.nameSingular === 'outreachFollowUp',
  );
  const rawOptions = followUp.fieldsList.find(
    (field) => field.name === 'status',
  ).options;
  const options =
    typeof rawOptions === 'string' ? JSON.parse(rawOptions) : rawOptions;
  if (options?.map((row) => row.value).join(',') !== 'OPEN,COMPLETED,CANCELLED')
    throw new Error('Follow-up status options are invalid');
  for (const [id, name, settings] of EXPERIENCE_TRIGGERS) {
    const fn = one(
      application.logicFunctions ?? [],
      (row) => row.universalIdentifier === id,
      name,
    );
    const actual =
      typeof fn.databaseEventTriggerSettings === 'string'
        ? JSON.parse(fn.databaseEventTriggerSettings)
        : fn.databaseEventTriggerSettings;
    if (fn.name !== name || JSON.stringify(actual) !== JSON.stringify(settings))
      throw new Error(`${name} trigger is invalid`);
  }
  const backfill = one(
    application.logicFunctions ?? [],
    (row) => row.universalIdentifier === '40590631-e998-5a8b-a194-d8a7ec40fb5a',
    'owning-application backfill function',
  );
  if (
    backfill.name !== 'execute-experience-backfill' ||
    [
      'databaseEventTriggerSettings',
      'httpRouteTriggerSettings',
      'cronTriggerSettings',
      'toolTriggerSettings',
      'workflowActionTriggerSettings',
    ].some((field) => backfill[field] != null)
  )
    throw new Error('Backfill function must remain untriggered');
};

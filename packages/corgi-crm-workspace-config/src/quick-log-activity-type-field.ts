// Extracted from planner.ts so the backfill and the read-only diagnostics can
// share the pinned option ids without depending on the field-creation plan.
// Option values must be UPPER_SNAKE_CASE and option ids must stay pinned, or a
// re-bootstrap would mint new ids and orphan every stored value.
export const QUICK_LOG_ACTIVITY_TYPE_SELECT_FIELD_DEFINITION = {
  name: 'activityTypeOption',
  label: 'Activity',
  type: 'SELECT',
  options: [
    {
      id: '674e00ba-3ddd-4a16-a87b-db54cccd0bbe',
      value: 'PHONE_CALL',
      label: 'Phone call',
      position: 0,
      color: 'blue',
    },
    {
      id: '6cafe527-c133-4b94-8599-5084a99ccce4',
      value: 'EMAIL',
      label: 'Email',
      position: 1,
      color: 'purple',
    },
    {
      id: 'e826f83d-1c4e-4a9f-918c-b1dc0f47f9a8',
      value: 'LINKEDIN',
      label: 'LinkedIn',
      position: 2,
      color: 'sky',
    },
    {
      id: '5f17c937-9322-4a72-b401-eccb72a0a22b',
      value: 'MEETING',
      label: 'Meeting',
      position: 3,
      color: 'green',
    },
    {
      id: 'd5f3cd92-d8f1-46a5-981f-74af1dc94a34',
      value: 'OTHER',
      label: 'Other',
      position: 4,
      color: 'gray',
    },
  ],
} as const;

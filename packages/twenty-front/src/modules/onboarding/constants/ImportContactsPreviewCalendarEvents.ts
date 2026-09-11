export type ImportContactsPreviewCalendarEvent = {
  id: string;
  title: string;
  time: string;
  color: 'orange' | 'sky';
};

export const IMPORT_CONTACTS_PREVIEW_CALENDAR_EVENTS = [
  {
    id: 'intro-call',
    title: 'Intro call x Northgate Advisors',
    time: '10:00am',
    color: 'orange',
  },
  {
    id: 'riley-chen',
    title: 'Riley Chen',
    time: '3:00pm',
    color: 'sky',
  },
] satisfies ImportContactsPreviewCalendarEvent[];

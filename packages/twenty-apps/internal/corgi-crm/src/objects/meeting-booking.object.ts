import {
  defineObject,
  FieldType,
  MetadataWritability,
} from 'twenty-sdk/define';

import {
  MEETING_BOOKING_BOOKED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_STATUS,
  MEETING_BOOKING_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_STATUS_OPTION_UNIVERSAL_IDENTIFIERS,
  MEETING_BOOKING_VALIDATION_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';

export default defineObject({
  universalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'meetingBooking',
  namePlural: 'meetingBookings',
  labelSingular: 'Meeting',
  labelPlural: 'Meetings',
  description: 'A meeting scheduled with an RIA or company',
  icon: 'IconCalendarEvent',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier:
        MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Meeting',
      description: 'Short meeting title',
      icon: 'IconAbc',
      defaultValue: "''",
    },
    {
      universalIdentifier:
        MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'scheduledAt',
      label: 'Scheduled at',
      description: 'Date and time the meeting will happen',
      icon: 'IconClock',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        MEETING_BOOKING_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      description: 'Set to Booked after the RIA, owner, and time are entered',
      icon: 'IconProgress',
      defaultValue: `'${MEETING_BOOKING_STATUS.DRAFT}'`,
      options: [
        {
          id: MEETING_BOOKING_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.draft,
          value: MEETING_BOOKING_STATUS.DRAFT,
          label: 'Draft',
          position: 0,
          color: 'gray',
        },
        {
          id: MEETING_BOOKING_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.booked,
          value: MEETING_BOOKING_STATUS.BOOKED,
          label: 'Booked',
          position: 1,
          color: 'blue',
        },
        {
          id: MEETING_BOOKING_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.completed,
          value: MEETING_BOOKING_STATUS.COMPLETED,
          label: 'Completed',
          position: 2,
          color: 'green',
        },
        {
          id: MEETING_BOOKING_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.cancelled,
          value: MEETING_BOOKING_STATUS.CANCELLED,
          label: 'Cancelled',
          position: 3,
          color: 'gray',
        },
        {
          id: MEETING_BOOKING_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.noShow,
          value: MEETING_BOOKING_STATUS.NO_SHOW,
          label: 'No show',
          position: 4,
          color: 'red',
        },
      ],
    },
    {
      universalIdentifier:
        MEETING_BOOKING_BOOKED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'bookedAt',
      label: 'Booked at',
      description: 'Immutable first-booked timestamp maintained by Corgi CRM',
      icon: 'IconCalendarCheck',
      isNullable: true,
      defaultValue: null,
      isUIEditable: false,
      writability: MetadataWritability.APPLICATION,
    },
    {
      universalIdentifier:
        MEETING_BOOKING_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RICH_TEXT,
      name: 'notes',
      label: 'Notes',
      description: 'Agenda or meeting context',
      icon: 'IconNotes',
      isNullable: true,
    },
    {
      universalIdentifier:
        MEETING_BOOKING_VALIDATION_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'bookingValidationMessage',
      label: 'Booking check',
      description: 'Why a meeting could not be marked as booked',
      icon: 'IconAlertTriangle',
      isNullable: true,
      defaultValue: null,
      isUIEditable: false,
      writability: MetadataWritability.APPLICATION,
    },
  ],
});

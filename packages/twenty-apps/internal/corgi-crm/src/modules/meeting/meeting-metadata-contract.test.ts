import {
  MetadataWritability,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewCalendarLayout,
  ViewType,
} from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

const WHOLESALER_OBJECT_ID = '33333333-3333-4333-8333-333333333333';

process.env.CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER =
  WHOLESALER_OBJECT_ID;
process.env.CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER =
  '44444444-4444-4444-8444-444444444444';

const identifiers = await import('src/modules/meeting/meeting-identifiers');
const { default: meetingBooking } = await import(
  'src/objects/meeting-booking.object'
);
const { default: companyOnMeetingBooking } = await import(
  'src/fields/company-on-meeting-booking.field'
);
const { default: meetingsOnCompany } = await import(
  'src/fields/meeting-bookings-on-company.field'
);
const { default: wholesalerOnMeetingBooking } = await import(
  'src/fields/wholesaler-on-meeting-booking.field'
);
const { default: meetingsOnWholesaler } = await import(
  'src/fields/meeting-bookings-on-wholesaler.field'
);
const { default: externalWholesalerOnMeetingBooking } = await import(
  'src/fields/external-wholesaler-on-meeting-booking.field'
);
const { default: meetingsAttributedOnWholesaler } = await import(
  'src/fields/meeting-bookings-attributed-on-wholesaler.field'
);
const { default: bookedByOnMeetingBooking } = await import(
  'src/fields/booked-by-on-meeting-booking.field'
);
const { default: meetingsBookedOnWorkspaceMember } = await import(
  'src/fields/meeting-bookings-booked-on-workspace-member.field'
);
const { default: allMeetingsView } = await import(
  'src/views/all-meeting-bookings.view'
);
const { default: meetingCalendarView } = await import(
  'src/views/meeting-bookings-calendar.view'
);
const { default: meetingRecordFieldsView } = await import(
  'src/views/meeting-booking-record-fields.view'
);
const { default: meetingRecordPage } = await import(
  'src/page-layouts/meeting-booking.page-layout'
);

const field = (name: string) =>
  meetingBooking.config.fields.find((candidate) => candidate.name === name);

describe('Meeting booking metadata', () => {
  it('defines a draft-first schedulable meeting with server-valid status options', () => {
    expect(meetingBooking.success).toBe(true);
    expect(meetingBooking.config).toMatchObject({
      nameSingular: 'meetingBooking',
      namePlural: 'meetingBookings',
      isSearchable: true,
      labelIdentifierFieldMetadataUniversalIdentifier:
        identifiers.MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(field('status')).toMatchObject({
      defaultValue: "'DRAFT'",
      options: [
        expect.objectContaining({ value: 'DRAFT' }),
        expect.objectContaining({ value: 'BOOKED' }),
        expect.objectContaining({ value: 'COMPLETED' }),
        expect.objectContaining({ value: 'CANCELLED' }),
        expect.objectContaining({ value: 'NO_SHOW' }),
      ],
    });
    for (const option of field('status')?.options ?? []) {
      expect(option.value).toMatch(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);
    }
  });

  it('keeps booking evidence and native validation feedback application-owned', () => {
    expect(field('bookedAt')).toMatchObject({
      isNullable: true,
      isUIEditable: false,
      writability: MetadataWritability.APPLICATION,
    });
    expect(field('bookedBy')).toBeUndefined();
    expect(field('bookingValidationMessage')).toMatchObject({
      isNullable: true,
      isUIEditable: false,
      writability: MetadataWritability.APPLICATION,
    });
    expect(field('scheduledAt')?.isNullable).toBe(true);
  });

  it('links every booking to its RIA, owner, and immutable booking actor', () => {
    expect(companyOnMeetingBooking.config).toMatchObject({
      name: 'company',
      objectUniversalIdentifier:
        identifiers.MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
      universalSettings: { joinColumnName: 'companyId' },
    });
    expect(meetingsOnCompany.config.objectUniversalIdentifier).toBe(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
    );
    expect(wholesalerOnMeetingBooking.config).toMatchObject({
      name: 'wholesaler',
      relationTargetObjectMetadataUniversalIdentifier: WHOLESALER_OBJECT_ID,
      universalSettings: { joinColumnName: 'wholesalerId' },
    });
    expect(meetingsOnWholesaler.config.objectUniversalIdentifier).toBe(
      WHOLESALER_OBJECT_ID,
    );
    expect(bookedByOnMeetingBooking.config).toMatchObject({
      name: 'bookedBy',
      isUIEditable: false,
      writability: MetadataWritability.APPLICATION,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
          .universalIdentifier,
      universalSettings: { joinColumnName: 'bookedById' },
    });
    expect(
      meetingsBookedOnWorkspaceMember.config.objectUniversalIdentifier,
    ).toBe(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
    );
  });

  it('lets a booker choose the EW a meeting is attributed to', () => {
    expect(externalWholesalerOnMeetingBooking.success).toBe(true);
    expect(externalWholesalerOnMeetingBooking.config).toMatchObject({
      name: 'externalWholesaler',
      label: 'EW / external wholesaler',
      isNullable: true,
      objectUniversalIdentifier:
        identifiers.MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetObjectMetadataUniversalIdentifier: WHOLESALER_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier:
        identifiers.MEETING_BOOKINGS_ATTRIBUTED_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
      universalSettings: { joinColumnName: 'externalWholesalerId' },
    });
    // The EW is a human choice, so it must not inherit the application-owned
    // protection the booking evidence fields carry.
    expect(externalWholesalerOnMeetingBooking.config.isUIEditable).not.toBe(
      false,
    );
    expect(externalWholesalerOnMeetingBooking.config.writability).not.toBe(
      MetadataWritability.APPLICATION,
    );
    expect(externalWholesalerOnMeetingBooking.config.universalIdentifier).not.toBe(
      identifiers.WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
    );
    expect(meetingsAttributedOnWholesaler.config).toMatchObject({
      name: 'attributedMeetings',
      objectUniversalIdentifier: WHOLESALER_OBJECT_ID,
      relationTargetObjectMetadataUniversalIdentifier:
        identifiers.MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        identifiers.EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
    });
  });

  it('provides native table, calendar, and record fields experiences', () => {
    expect(allMeetingsView.config).toMatchObject({
      objectUniversalIdentifier:
        identifiers.MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
      type: ViewType.TABLE,
    });
    expect(meetingCalendarView.config).toMatchObject({
      objectUniversalIdentifier:
        identifiers.MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
      type: ViewType.CALENDAR,
      calendarLayout: ViewCalendarLayout.MONTH,
      calendarFieldMetadataUniversalIdentifier:
        identifiers.MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(meetingRecordFieldsView.config).toMatchObject({
      type: ViewType.FIELDS_WIDGET,
    });
    expect(
      (meetingRecordFieldsView.config.fields ?? []).some(
        (viewField) =>
          viewField.fieldMetadataUniversalIdentifier ===
          identifiers.MEETING_BOOKING_VALIDATION_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
      ),
    ).toBe(true);
    for (const view of [allMeetingsView, meetingRecordFieldsView]) {
      expect(
        (view.config.fields ?? []).some(
          (viewField) =>
            viewField.fieldMetadataUniversalIdentifier ===
            identifiers.EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
        ),
      ).toBe(true);
    }
    for (const view of [allMeetingsView, meetingRecordFieldsView]) {
      const positions = (view.config.fields ?? []).map(
        (viewField) => viewField.position,
      );
      expect(new Set(positions).size).toBe(positions.length);
    }
    expect(meetingRecordPage.success).toBe(true);
    expect(meetingRecordPage.config).toMatchObject({
      type: 'RECORD_PAGE',
      objectUniversalIdentifier:
        identifiers.MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
    });
  });
});

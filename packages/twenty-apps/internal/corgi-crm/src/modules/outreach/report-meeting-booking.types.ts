export type ReportMeetingBooking = {
  id: string;
  bookedAt: string;
  scheduledAt?: string;
  wholesalerId: string;
  wholesalerName: string;
};

export type MeetingBookingReportRepository = {
  listMeetingBookings(input: {
    start: string;
    end: string;
  }): Promise<ReportMeetingBooking[]>;
};

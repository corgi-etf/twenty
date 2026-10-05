export type ReportMeetingBooking = {
  id: string;
  bookedAt: string | null;
  heldAt?: string;
  status?: string;
  bookedById?: string;
  takenById?: string;
  bookedByWholesalerId?: string;
  bookedByName?: string;
  takenByWholesalerId?: string;
  takenByName?: string;
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

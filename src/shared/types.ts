import type { SlotStatus } from "./slots.js";

export interface Employee {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  lineManagerName: string;
  lineManagerEmail: string;
}

/** Public-safe employee record (no line-manager PII) for pickers. */
export interface EmployeeLite {
  employeeId: string;
  name: string;
  email: string;
  department: string;
}

export interface Participant {
  employeeId: string;
  name: string;
  email: string;
  isOwner: boolean;
}

export type BookingStatus = "Confirmed" | "Cancelled";

export interface Booking {
  bookingId: string;
  createdAt: string;
  date: string; // YYYY-MM-DD
  slotId: number;
  slotLabel: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  participants: Participant[];
  playerCount: number;
  cancelledAt?: string;
  cancelledBy?: string;
  notes?: string;
  /** Set for /bookings?employeeId= results: can this viewer still cancel it? */
  canCancel?: boolean;
}

export interface SlotView {
  id: number;
  label: string;
  start: string;
  end: string;
  status: SlotStatus;
  /** present when status === "booked" */
  booking?: {
    bookingId: string;
    ownerName: string;
    ownerId: string;
    players: { name: string; employeeId: string }[];
    isMine: boolean;
    canCancel: boolean;
  };
  /** present when status === "blocked" */
  blockReason?: string;
}

export interface DayAvailability {
  date: string;
  fullDayBlocked: boolean;
  fullDayReason?: string;
  slots: SlotView[];
}

export interface BlockedSlot {
  blockId: string;
  date: string;
  slotId: number;
  slotLabel: string;
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface BlockedDate {
  blockId: string;
  date: string;
  reason: string;
  createdAt: string;
  createdBy: string;
}

export type QuestionType = "star" | "scale" | "yesno" | "choice" | "text";

export interface RatingQuestion {
  questionId: string;
  order: number;
  text: string;
  type: QuestionType;
  options: string[];
  active: boolean;
  createdAt: string;
}

export interface RatingResponseRow {
  responseId: string;
  submittedAt: string;
  bookingId: string;
  employeeId: string;
  employeeName: string;
  questionId: string;
  questionText: string;
  answer: string;
}

export interface AdminStats {
  totalBookings: number;
  todayBookings: number;
  upcomingBookings: number;
  cancelledBookings: number;
  blockedSlots: number;
  blockedDates: number;
  totalRatings: number;
}

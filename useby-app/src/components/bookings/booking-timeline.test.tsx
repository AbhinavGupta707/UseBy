import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { normalizeBooking } from "../../lib/bookings/api";
import { BookingTimeline } from "./booking-timeline";

describe("BookingTimeline", () => {
  it("renders active handoff states and terminal disputes", () => {
    const booking = normalizeBooking({
      id: "booking-1",
      status: "disputed",
      created_at: "2026-07-01T12:00:00.000Z",
    });

    render(<BookingTimeline booking={booking} />);

    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("Disputed")).toBeInTheDocument();
    expect(screen.getByText("Handoff needs moderation or support review.")).toBeInTheDocument();
  });
});

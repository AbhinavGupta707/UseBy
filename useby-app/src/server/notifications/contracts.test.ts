import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  REQUIRED_NOTIFICATION_COLUMNS,
  notificationIdempotencyKey,
  type NotificationCandidate,
} from "./contracts";

describe("notification contracts", () => {
  it("documents the table columns required by the CP8 notification runtime", () => {
    expect(REQUIRED_NOTIFICATION_COLUMNS).toEqual(
      expect.arrayContaining([
        "audience",
        "household_id",
        "merchant_id",
        "source_type",
        "source_id",
        "event_type",
        "channel_status",
        "idempotency_key",
        "read_at",
      ]),
    );
  });

  it("uses recipient scope and source row identity for idempotency", () => {
    const baseCandidate: NotificationCandidate = {
      audience: "household",
      householdId: "household-a",
      sourceType: "booking",
      sourceId: "booking-a",
      eventType: "booking_pickup_reminder",
      title: "Pickup reminder",
      body: "Pickup details are ready in UseBy.",
      actionHref: "/bookings",
      reminderAt: null,
      metadata: {},
    };

    expect(notificationIdempotencyKey(baseCandidate)).toBe(
      "notification:booking_pickup_reminder:household:household-a:booking:booking-a",
    );
    expect(
      notificationIdempotencyKey({
        ...baseCandidate,
        householdId: "household-b",
      }),
    ).not.toBe(notificationIdempotencyKey(baseCandidate));
  });

  it("keeps the notification writer aligned to the runtime table contract", () => {
    const runtimeSource = readFileSync("src/server/notifications/runtime.ts", "utf8");
    const insertStatement = runtimeSource.match(
      /insert into notifications \([\s\S]*?returning id::text as id/,
    )?.[0];

    expect(insertStatement, "notification insert SQL should be discoverable").toBeTruthy();

    for (const column of REQUIRED_NOTIFICATION_COLUMNS) {
      if (column === "id" || column === "read_at") {
        continue;
      }

      expect(insertStatement, `writeNotificationCandidate must reference ${column}`).toContain(
        column,
      );
    }

    expect(insertStatement).not.toContain("recipient_household_id");
    expect(insertStatement).not.toContain("recipient_user_id");
    expect(insertStatement).not.toContain("recipient_merchant_id");
  });
});

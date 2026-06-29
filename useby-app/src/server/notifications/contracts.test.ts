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
        "recipient_household_id",
        "recipient_merchant_id",
        "topic",
        "entity_type",
        "entity_id",
        "source",
        "metadata",
        "idempotency_key",
        "read_at",
      ]),
    );
    expect(REQUIRED_NOTIFICATION_COLUMNS).not.toContain("audience");
    expect(REQUIRED_NOTIFICATION_COLUMNS).not.toContain("channel_status");
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
    const insertColumns = insertStatement?.match(
      /insert into notifications \(([\s\S]*?)\)\s*select/,
    )?.[1];

    expect(insertStatement, "notification insert SQL should be discoverable").toBeTruthy();
    expect(insertColumns, "notification insert columns should be discoverable").toBeTruthy();

    for (const column of [
      "recipient_household_id",
      "recipient_merchant_id",
      "neighbourhood_id",
      "channel",
      "topic",
      "title",
      "body",
      "status",
      "entity_type",
      "entity_id",
      "source",
      "metadata",
      "idempotency_key",
      "demo_scope_id",
      "is_demo",
      "created_at",
    ]) {
      expect(insertColumns, `writeNotificationCandidate must insert ${column}`).toContain(column);
    }

    expect(insertColumns).not.toContain("audience");
    expect(insertColumns).not.toContain("channel_status");
    expect(REQUIRED_NOTIFICATION_COLUMNS).toContain("recipient_user_id");
    expect(insertColumns).not.toContain("recipient_user_id");
  });
});

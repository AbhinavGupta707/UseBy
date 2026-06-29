import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import type { DemoActorContext } from "../demo/context";
import {
  BookingRuntimeError,
  isBookingRuntimeError,
  listBookings,
} from "./runtime";

const demoContext: DemoActorContext = {
  demoScope: "demo:riverside-quarter",
  household: {
    id: "6d4d1ad3-6c3e-4f18-a9c0-1249f5f0c101",
    displayName: "Demo Household",
    publicLabel: "Atrium 2A",
    coarseLocationLabel: "Riverside Quarter",
  },
  user: {
    id: "6d4d1ad3-6c3e-4f18-a9c0-1249f5f0c102",
    displayName: "Demo User",
    email: "demo@example.test",
  },
  neighbourhood: {
    id: "6d4d1ad3-6c3e-4f18-a9c0-1249f5f0c103",
    name: "Riverside Quarter",
    slug: "riverside-quarter",
  },
};

describe("booking runtime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an honest unavailable error when Aurora env is missing", async () => {
    vi.stubEnv("AWS_REGION", "");
    vi.stubEnv("AURORA_CLUSTER_ARN", "");
    vi.stubEnv("AURORA_SECRET_ARN", "");
    vi.stubEnv("AURORA_APP_SECRET_ARN", "");
    vi.stubEnv("AURORA_DATABASE", "");

    await expect(listBookings(demoContext)).rejects.toMatchObject({
      name: "BookingRuntimeError",
      status: 503,
      message: expect.stringContaining("Aurora env missing"),
    });
  });

  it("narrows booking runtime errors for route handlers", () => {
    expect(isBookingRuntimeError(new BookingRuntimeError(409, "conflict"))).toBe(true);
    expect(isBookingRuntimeError(new Error("plain"))).toBe(false);
  });

  it("keeps merged safety policy and trust hooks wired into booking transitions", () => {
    const source = readFileSync("src/server/bookings/runtime.ts", "utf8");

    expect(source).toContain("evaluateBookingPolicy");
    expect(source).toContain("persistHouseholdTrustScore");
    expect(source).toContain("relationshipBlockExists");
  });
});

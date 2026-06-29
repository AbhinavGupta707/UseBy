import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEMO_HOUSEHOLD_DEMO_ID,
  demoUuidFor,
  selectDemoContextIds,
} from "./context";

describe("demo actor context selectors", () => {
  it("defaults to the Riverside Quarter Atrium 2A demo household", () => {
    expect(selectDemoContextIds()).toMatchObject({
      householdId: demoUuidFor(DEFAULT_DEMO_HOUSEHOLD_DEMO_ID),
      householdSelector: DEFAULT_DEMO_HOUSEHOLD_DEMO_ID,
      userId: null,
    });
  });

  it("accepts safe fixture selectors from query params", () => {
    const searchParams = new URLSearchParams({
      demoHouseholdId: "hh-atrium-5c",
      demoUserId: "hh-atrium-5c",
    });

    expect(selectDemoContextIds({ searchParams })).toMatchObject({
      householdId: demoUuidFor("hh-atrium-5c"),
      userId: demoUuidFor("user:hh-atrium-5c"),
    });
  });

  it("rejects unknown non-uuid selectors before they reach SQL", () => {
    const searchParams = new URLSearchParams({
      demoHouseholdId: "not-a-demo-household",
      demoUserId: "not-a-demo-user",
    });

    expect(selectDemoContextIds({ searchParams })).toMatchObject({
      householdId: null,
      userId: null,
    });
  });
});

import { afterEach, describe, expect, it } from "vitest";

import { geocodeAddress, geocodingProviderState } from "./provider";
import { publicGeocodeDto } from "./contracts";
import { locationPrivacyLeaks } from "../locations/privacy";

describe("geocoding provider", () => {
  const previousToken = process.env.MAPBOX_ACCESS_TOKEN;

  afterEach(() => {
    if (previousToken === undefined) {
      delete process.env.MAPBOX_ACCESS_TOKEN;
    } else {
      process.env.MAPBOX_ACCESS_TOKEN = previousToken;
    }
  });

  it("reports honest no-key state while allowing deterministic demo fixtures", async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    expect(geocodingProviderState()).toMatchObject({
      configured: false,
      provider: "unavailable",
      mode: "unavailable",
    });

    const fixture = await geocodeAddress({
      address: "Atrium Hall 2A, Riverside Quarter",
      countryCode: "GB",
      fixtureOnly: false,
    });

    expect(fixture.ok).toBe(true);
    if (fixture.ok) {
      expect(fixture.provider).toBe("fixture");
      expect(fixture.point).toMatchObject({
        latitude: expect.any(Number),
        longitude: expect.any(Number),
      });
      const dto = publicGeocodeDto(fixture);
      expect(dto.coarseLocation.areaLabel).toBe("Atrium Hall area");
      expect(locationPrivacyLeaks(dto)).toEqual([]);
      expect(JSON.stringify(dto)).not.toContain("2A");
    }
  });

  it("returns unavailable without pretending an unmatched no-key geocode succeeded", async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    const result = await geocodeAddress({
      address: "221B Baker Street",
      countryCode: "GB",
      fixtureOnly: false,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "unavailable",
    });
    if (!result.ok) {
      expect(result.reason).toContain("MAPBOX_ACCESS_TOKEN");
    }
  });
});

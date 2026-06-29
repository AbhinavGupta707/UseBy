import { describe, expect, it } from "vitest";

import {
  coarseLocationDto,
  distanceBandMeters,
  locationPrivacyLeaks,
  sanitizePublicLocationText,
} from "./privacy";

describe("location privacy helpers", () => {
  it("rounds exact distances into coarse bands", () => {
    expect(distanceBandMeters(0)).toBe(0);
    expect(distanceBandMeters(1)).toBe(250);
    expect(distanceBandMeters(251)).toBe(500);
    expect(distanceBandMeters(null)).toBeNull();
  });

  it("scrubs unit labels, raw addresses, direct contact, and exact coordinates from public labels", () => {
    const label = sanitizePublicLocationText(
      "Flat 2A, 1 Private Street, SE1 1AA, 51.5068,-0.1045, test@example.com, +44 7700 900123",
    );

    expect(label.toLowerCase()).not.toMatch(/flat|2a|private street|se1 1aa|51\.5068|example\.com|7700/);
  });

  it("builds coarse DTOs without exact household fields", () => {
    const dto = coarseLocationDto({
      areaLabel: "Courtyard side",
      neighbourhoodName: "Riverside Quarter",
      distanceMeters: 360,
      pickupAreaLabel: "Market arch",
    });

    expect(dto).toMatchObject({
      areaLabel: "Courtyard side",
      neighbourhood: "Riverside Quarter",
      distanceBandMeters: 500,
      privacy: {
        exactCoordinates: false,
        rawAddress: false,
        unitLabel: false,
        directContact: false,
      },
    });
    expect(locationPrivacyLeaks(dto)).toEqual([]);
  });
});

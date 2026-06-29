import { describe, expect, it } from "vitest";

import { getEmailProviderStatus } from "./email";

describe("email notification provider status", () => {
  it("reports unavailable when Resend is selected without a key", () => {
    const status = getEmailProviderStatus({
      USEBY_EMAIL_PROVIDER: "resend",
      USEBY_EMAIL_DRY_RUN: "true",
    });

    expect(status).toMatchObject({
      provider: "resend",
      configured: false,
      dryRun: true,
      status: "email_unavailable",
    });
    expect(status.reason).toContain("RESEND_API_KEY");
  });

  it("reports dry-run instead of fake sent when provider keys exist", () => {
    const status = getEmailProviderStatus({
      USEBY_EMAIL_PROVIDER: "resend",
      USEBY_EMAIL_DRY_RUN: "true",
      RESEND_API_KEY: "test-key",
    });

    expect(status).toMatchObject({
      configured: true,
      dryRun: true,
      status: "email_dry_run",
    });
    expect(status.reason).not.toContain("sent");
  });

  it("does not claim sent status when dry-run is disabled but no live adapter exists", () => {
    const status = getEmailProviderStatus({
      USEBY_EMAIL_PROVIDER: "resend",
      USEBY_EMAIL_DRY_RUN: "false",
      RESEND_API_KEY: "test-key",
    });

    expect(status.status).toBe("email_unavailable");
    expect(status.reason).toContain("not enabled");
  });
});

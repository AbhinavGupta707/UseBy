import type { NotificationCandidate, NotificationChannelStatus } from "./contracts";

type EmailEnv = Record<string, string | undefined>;

export type EmailProviderStatus = {
  provider: string;
  configured: boolean;
  dryRun: boolean;
  status: Exclude<NotificationChannelStatus, "in_app_recorded" | "email_skipped">;
  reason: string;
};

export function getEmailProviderStatus(env: EmailEnv = process.env): EmailProviderStatus {
  const provider = env.USEBY_EMAIL_PROVIDER?.trim() || "resend";
  const dryRun = env.USEBY_EMAIL_DRY_RUN !== "false";

  if (provider === "resend") {
    const configured = Boolean(env.RESEND_API_KEY?.trim());
    if (!configured) {
      return {
        provider,
        configured: false,
        dryRun,
        status: "email_unavailable",
        reason: "RESEND_API_KEY is not configured.",
      };
    }
  } else if (provider === "ses") {
    const configured = Boolean(env.AWS_REGION?.trim());
    if (!configured) {
      return {
        provider,
        configured: false,
        dryRun,
        status: "email_unavailable",
        reason: "AWS_REGION is not configured for SES.",
      };
    }
  } else {
    return {
      provider,
      configured: false,
      dryRun,
      status: "email_unavailable",
      reason: `Unsupported email provider: ${provider}.`,
    };
  }

  return {
    provider,
    configured: true,
    dryRun,
    status: dryRun ? "email_dry_run" : "email_unavailable",
    reason: dryRun
      ? "Email provider is configured, but USEBY_EMAIL_DRY_RUN is enabled."
      : "Live email send adapter is not enabled in CP8 Lane 8C.",
  };
}

export function emailStatusForCandidate(
  _candidate: NotificationCandidate,
  env: EmailEnv = process.env,
): EmailProviderStatus {
  return getEmailProviderStatus(env);
}

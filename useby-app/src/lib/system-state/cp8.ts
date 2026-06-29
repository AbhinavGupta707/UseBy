import { getAiCopyReadiness } from "../../server/ai/provider";
import { getLangSmithReadiness } from "../../server/ai/langsmith";
import { getStructuredAiReadiness } from "../../server/ai/structured";
import { aiGuardrailSummary } from "../../server/ai/guardrails";
import {
  getTableAvailability,
  publicErrorMessage,
  type TableAvailability,
} from "../../server/db/introspection";
import { getSemanticRankingReadiness } from "../../server/matching/semantic";

export type Cp8ReadinessStatus = "ready" | "configured" | "disabled" | "unavailable";

export type Cp8ProviderStatus = {
  key: string;
  label: string;
  status: Cp8ReadinessStatus;
  configured: boolean;
  noKey: boolean;
  detail: string;
};

export type Cp8EvidenceHook = {
  key: string;
  label: string;
  status: Cp8ReadinessStatus;
  detail: string;
};

export type Cp8SystemState = {
  providers: Cp8ProviderStatus[];
  privateFileEvidence: Cp8EvidenceHook;
  geocodingPrivacy: Cp8EvidenceHook;
  notificationJobs: Cp8EvidenceHook;
  aiGuardrails: ReturnType<typeof aiGuardrailSummary> & {
    status: "ready";
    detail: string;
  };
};

function read(source: Record<string, string | undefined>, name: string): string | null {
  const value = source[name]?.trim();
  return value ? value : null;
}

function hasAny(source: Record<string, string | undefined>, names: string[]): boolean {
  return names.some((name) => Boolean(read(source, name)));
}

function tableHook(
  availability: TableAvailability,
  requiredColumns: string[],
): Cp8ReadinessStatus {
  if (!availability.exists) {
    return "unavailable";
  }

  const missingColumns = requiredColumns.filter((column) => !availability.columns.has(column));
  return missingColumns.length === 0 ? "ready" : "unavailable";
}

function tableDetail(
  availability: TableAvailability,
  requiredColumns: string[],
  readyDetail: string,
  missingTableDetail: string,
): string {
  if (!availability.exists) {
    return missingTableDetail;
  }

  const missingColumns = requiredColumns.filter((column) => !availability.columns.has(column));
  if (missingColumns.length > 0) {
    return `Table is present but missing CP8 evidence columns: ${missingColumns.join(", ")}.`;
  }

  return readyDetail;
}

async function safeTableAvailability(
  tableName: string,
  databaseConfigured: boolean,
): Promise<TableAvailability | null> {
  if (!databaseConfigured) {
    return null;
  }

  try {
    return await getTableAvailability(tableName);
  } catch {
    return null;
  }
}

export async function getCp8SystemState(
  options: {
    env?: Record<string, string | undefined>;
    databaseConfigured: boolean;
  },
): Promise<Cp8SystemState> {
  const env = options.env ?? process.env;
  const ai = getAiCopyReadiness(env);
  const agentAi = getStructuredAiReadiness(env);
  const langsmith = getLangSmithReadiness(env);
  const semantic = getSemanticRankingReadiness(env);
  const storageConfigured = hasAny(env, ["AWS_S3_BUCKET"]);
  const textractConfigured = hasAny(env, [
    "AWS_TEXTRACT_REGION",
    "AWS_TEXTRACT_FEATURES",
    "AWS_ROLE_ARN",
  ]);
  const geocodingConfigured = hasAny(env, [
    "MAPBOX_ACCESS_TOKEN",
    "GEOCODING_PROVIDER",
    "OPENCAGE_API_KEY",
    "GOOGLE_MAPS_API_KEY",
  ]);
  const notificationConfigured = hasAny(env, ["RESEND_API_KEY", "AWS_SES_FROM_EMAIL"]);

  const [filesTable, notificationsTable, jobRunsTable] = await Promise.all([
    safeTableAvailability("files", options.databaseConfigured),
    safeTableAvailability("notifications", options.databaseConfigured),
    safeTableAvailability("job_runs", options.databaseConfigured),
  ]);

  const privateFileEvidence: Cp8EvidenceHook = filesTable
    ? {
        key: "private-file-evidence",
        label: "Private file evidence",
        status: tableHook(
          filesTable,
          ["bucket", "object_key", "role", "owner_household_id", "metadata"],
        ),
        detail: tableDetail(
          filesTable,
          ["bucket", "object_key", "role", "owner_household_id", "metadata"],
          "Files table can record private object keys and ownership hooks without public URLs.",
          "Files table is not available yet; Lane 8A upload evidence should populate this hook.",
        ),
      }
    : {
        key: "private-file-evidence",
        label: "Private file evidence",
        status: "unavailable",
        detail: "Aurora env is unavailable, so private file evidence could not be checked.",
      };

  const geocodingPrivacy: Cp8EvidenceHook = {
    key: "geocoding-privacy",
    label: "Geocoding privacy",
    status: geocodingConfigured ? "configured" : "unavailable",
    detail: geocodingConfigured
      ? "Geocoding provider env is present; public DTOs must continue to expose coarse labels only."
      : "No geocoding provider env is present; routes should return honest unavailable or fixture states.",
  };

  const notificationJobs: Cp8EvidenceHook = notificationsTable
    ? {
        key: "notification-jobs",
        label: "Notification jobs",
        status:
          notificationsTable.exists && jobRunsTable?.exists
            ? "ready"
            : notificationConfigured
              ? "configured"
              : "unavailable",
        detail: notificationsTable.exists
          ? "Notification table hook is present; pickup-reminder job evidence should come from job_runs."
          : notificationConfigured
            ? "Email provider env is present, but notifications table is not available yet."
            : "No email provider env or notifications table is available; no fake sent state should be shown.",
      }
    : {
        key: "notification-jobs",
        label: "Notification jobs",
        status: notificationConfigured ? "configured" : "unavailable",
        detail: notificationConfigured
          ? "Email provider env is present, but Aurora notification evidence could not be checked."
          : "No email provider env is present; email should report unavailable/dry-run state.",
      };

  return {
    providers: [
      {
        key: "s3-private-storage",
        label: "S3 private storage",
        status: storageConfigured ? "configured" : "unavailable",
        configured: storageConfigured,
        noKey: false,
        detail: storageConfigured
          ? "S3 bucket env is present; file DTOs should use IDs or signed access, not public URLs."
          : "S3 bucket env is missing; upload routes should return unavailable or fixture states.",
      },
      {
        key: "textract",
        label: "Amazon Textract",
        status: textractConfigured ? "configured" : "unavailable",
        configured: textractConfigured,
        noKey: !textractConfigured,
        detail: textractConfigured
          ? "Textract activation/env is present; parsing should still label dry-run vs live outcomes."
          : "Textract env is missing; receipt/label parsing must not pretend to be live.",
      },
      {
        key: "geocoding",
        label: "Geocoding",
        status: geocodingConfigured ? "configured" : "unavailable",
        configured: geocodingConfigured,
        noKey: !geocodingConfigured,
        detail: geocodingPrivacy.detail,
      },
      {
        key: "notifications",
        label: "Notifications",
        status: notificationJobs.status,
        configured: notificationConfigured,
        noKey: !notificationConfigured,
        detail: notificationJobs.detail,
      },
      {
        key: "ai-copy",
        label: "AI copy and explanations",
        status:
          ai.status === "ready"
            ? "ready"
            : ai.status === "disabled"
              ? "disabled"
              : "unavailable",
        configured: ai.configured,
        noKey: ai.noKey,
        detail: ai.detail,
      },
      {
        key: "semantic-ranking",
        label: "Semantic ranking",
        status:
          semantic.status === "ready"
            ? "ready"
            : semantic.status === "disabled"
              ? "disabled"
              : "unavailable",
        configured: semantic.enabled,
        noKey: semantic.noKey,
        detail: semantic.detail,
      },
      {
        key: "agent-drafts",
        label: "Agent draft workflows",
        status:
          agentAi.status === "ready"
            ? "ready"
            : agentAi.status === "disabled"
              ? "disabled"
              : "unavailable",
        configured: agentAi.configured,
        noKey: agentAi.noKey,
        detail: agentAi.detail,
      },
      {
        key: "langsmith",
        label: "LangSmith tracing",
        status: langsmith.status,
        configured: langsmith.configured,
        noKey: langsmith.noKey,
        detail: langsmith.detail,
      },
    ],
    privateFileEvidence,
    geocodingPrivacy,
    notificationJobs,
    aiGuardrails: {
      ...aiGuardrailSummary(),
      status: "ready",
      detail:
        "AI may write copy, explanations, summaries, and secondary ranking only after deterministic filters.",
    },
  };
}

export function cp8UnavailableState(reason: string): Cp8SystemState {
  try {
    return {
      providers: [
        {
          key: "ai-copy",
          label: "AI copy and explanations",
          status: "unavailable",
          configured: false,
          noKey: true,
          detail: reason,
        },
      ],
      privateFileEvidence: {
        key: "private-file-evidence",
        label: "Private file evidence",
        status: "unavailable",
        detail: reason,
      },
      geocodingPrivacy: {
        key: "geocoding-privacy",
        label: "Geocoding privacy",
        status: "unavailable",
        detail: reason,
      },
      notificationJobs: {
        key: "notification-jobs",
        label: "Notification jobs",
        status: "unavailable",
        detail: reason,
      },
      aiGuardrails: {
        ...aiGuardrailSummary(),
        status: "ready",
        detail:
          "AI guardrails are static application policy even when provider checks are unavailable.",
      },
    };
  } catch (error) {
    const detail = publicErrorMessage(error);
    return {
      providers: [],
      privateFileEvidence: {
        key: "private-file-evidence",
        label: "Private file evidence",
        status: "unavailable",
        detail,
      },
      geocodingPrivacy: {
        key: "geocoding-privacy",
        label: "Geocoding privacy",
        status: "unavailable",
        detail,
      },
      notificationJobs: {
        key: "notification-jobs",
        label: "Notification jobs",
        status: "unavailable",
        detail,
      },
      aiGuardrails: {
        ...aiGuardrailSummary(),
        status: "ready",
        detail,
      },
    };
  }
}

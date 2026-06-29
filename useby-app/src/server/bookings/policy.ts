import {
  isFoodShareEligible,
  type GroceryItemForRules,
} from "../actions/rules";
import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import { executeSql, sqlParam } from "../db/sql";
import { checkRelationshipBlock } from "../moderation/runtime";
import { checkSafetyAcknowledgement } from "../safety/runtime";

export type BookingPolicyAction = "request" | "accept";

export type BookingPolicyItem = GroceryItemForRules & {
  ownerHouseholdId: string | null;
};

export type BookingPolicyInput = {
  action: BookingPolicyAction;
  item: BookingPolicyItem;
  requesterHouseholdId: string;
  ownerHouseholdId: string;
  safetyAcknowledged: boolean;
  relationshipBlocked: boolean;
  now?: Date;
};

export type BookingPolicyDecision = {
  allowed: boolean;
  code: "allowed" | "policy_rejected";
  reasons: string[];
  rationale: string;
};

export type BookingPolicyGuardResult =
  | {
      status: "available";
      decision: BookingPolicyDecision;
      item: BookingPolicyItem;
    }
  | {
      status: "unavailable";
      decision: BookingPolicyDecision;
      reason: string;
    };

type ItemPolicyRow = {
  id: string;
  owner_household_id: string | null;
  category: string;
  title: string;
  quantity: string | number;
  item_state: string;
  storage_state: string | null;
  safety_status: string | null;
  expires_at: string | null;
  use_by_date: string | null;
  best_before_date: string | null;
  metadata: Record<string, unknown> | null;
};

const SHAREABLE_ITEM_STATES = new Set(["listed", "offered", "use_soon"]);

export function evaluateBookingPolicy(
  input: BookingPolicyInput,
): BookingPolicyDecision {
  const reasons: string[] = [];
  const now = input.now ?? new Date();
  const foodEligibility = isFoodShareEligible(input.item, now);

  if (input.item.category === "grocery" && !input.safetyAcknowledged) {
    reasons.push("Receiver must record the food handoff acknowledgement first.");
  }

  if (!foodEligibility.eligible) {
    reasons.push(...foodEligibility.reasons);
  }

  if (!SHAREABLE_ITEM_STATES.has(input.item.itemState)) {
    reasons.push(`Item state is ${input.item.itemState}.`);
  }

  if (input.requesterHouseholdId === input.ownerHouseholdId) {
    reasons.push("Requester and owner households must be different.");
  }

  if (input.relationshipBlocked) {
    reasons.push("A block exists between these households.");
  }

  const uniqueReasons = [...new Set(reasons)];
  const allowed = uniqueReasons.length === 0;

  return {
    allowed,
    code: allowed ? "allowed" : "policy_rejected",
    reasons: uniqueReasons,
    rationale: allowed
      ? `${input.action} is allowed by food safety, acknowledgement, expiry, and block policy.`
      : uniqueReasons.join(" "),
  };
}

function rowToItem(row: ItemPolicyRow): BookingPolicyItem {
  return {
    id: row.id,
    ownerHouseholdId: row.owner_household_id,
    title: row.title,
    category: row.category,
    quantity:
      typeof row.quantity === "number"
        ? row.quantity
        : Number.parseFloat(String(row.quantity)),
    itemState: row.item_state,
    storageState: row.storage_state,
    safetyStatus: row.safety_status,
    expiresAt: row.expires_at,
    useByDate: row.use_by_date,
    bestBeforeDate: row.best_before_date,
    metadata: row.metadata ?? {},
  };
}

export async function checkBookingPolicyForItem(input: {
  action: BookingPolicyAction;
  itemId: string;
  requesterHouseholdId: string;
  ownerHouseholdId?: string | null;
  bookingId?: string | null;
}): Promise<BookingPolicyGuardResult> {
  const env = loadRuntimeEnv();
  const unavailableDecision: BookingPolicyDecision = {
    allowed: false,
    code: "policy_rejected",
    reasons: ["Policy guard is unavailable."],
    rationale: "Policy guard is unavailable.",
  };

  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      decision: unavailableDecision,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  try {
    const result = await executeSql<ItemPolicyRow>({
      sql: `
        select
          id::text,
          owner_household_id::text,
          category::text,
          title,
          quantity,
          item_state::text,
          storage_state::text,
          safety_status::text,
          expires_at::text,
          use_by_date::text,
          best_before_date::text,
          metadata
        from item_instances
        where id = :itemId::uuid
          and deleted_at is null
        limit 1
      `,
      parameters: [sqlParam("itemId", input.itemId)],
    });
    const row = result.rows[0];
    if (!row) {
      return {
        status: "available",
        item: {
          id: input.itemId,
          ownerHouseholdId: input.ownerHouseholdId ?? null,
          title: "Unknown item",
          category: "grocery",
          quantity: 0,
          itemState: "unknown",
          storageState: "unknown",
          safetyStatus: "unknown",
        },
        decision: {
          allowed: false,
          code: "policy_rejected",
          reasons: ["Item is not available."],
          rationale: "Item is not available.",
        },
      };
    }

    const item = rowToItem(row);
    const ownerHouseholdId = input.ownerHouseholdId ?? item.ownerHouseholdId;
    if (!ownerHouseholdId) {
      return {
        status: "available",
        item,
        decision: {
          allowed: false,
          code: "policy_rejected",
          reasons: ["Item owner household is unknown."],
          rationale: "Item owner household is unknown.",
        },
      };
    }

    const ack = await checkSafetyAcknowledgement({
      householdId: input.requesterHouseholdId,
      acknowledgementType: "food_handoff",
      itemId: input.itemId,
      bookingId: input.bookingId ?? null,
    });
    if (ack.status === "unavailable") {
      return {
        status: "unavailable",
        decision: {
          allowed: false,
          code: "policy_rejected",
          reasons: ["Safety acknowledgement check is unavailable."],
          rationale: "Safety acknowledgement check is unavailable.",
        },
        reason: ack.reason,
      };
    }

    const block = await checkRelationshipBlock(input.requesterHouseholdId, ownerHouseholdId);
    if (block.status === "unavailable") {
      return {
        status: "unavailable",
        decision: {
          allowed: false,
          code: "policy_rejected",
          reasons: ["Block relationship check is unavailable."],
          rationale: "Block relationship check is unavailable.",
        },
        reason: block.reason,
      };
    }

    return {
      status: "available",
      item,
      decision: evaluateBookingPolicy({
        action: input.action,
        item,
        requesterHouseholdId: input.requesterHouseholdId,
        ownerHouseholdId,
        safetyAcknowledged: ack.acknowledged,
        relationshipBlocked: block.blocked,
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      decision: unavailableDecision,
      reason: publicErrorMessage(error),
    };
  }
}

export function assertBookingPolicyAllowed(result: BookingPolicyGuardResult) {
  if (result.status === "unavailable") {
    throw new Error(`Booking policy unavailable: ${result.reason}`);
  }

  if (!result.decision.allowed) {
    throw new Error(`Booking policy rejected: ${result.decision.rationale}`);
  }
}

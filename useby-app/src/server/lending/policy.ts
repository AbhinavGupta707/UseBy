import {
  checkLendingAvailability,
  type LendingAvailabilityDecision,
  type LendingWindowInput,
} from "./availability";
import {
  normalizeLendingTerms,
  type LendingTerms,
  type LendingTermsItem,
} from "./terms";
import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import { executeSql, sqlParam } from "../db/sql";
import { checkRelationshipBlock } from "../moderation/runtime";

export type LendingPolicyAction = "list" | "request" | "accept";

export type LendingPolicyItem = LendingTermsItem & {
  id: string;
  ownerHouseholdId: string | null;
  category: string;
  title: string;
  quantity?: number | string | null;
  itemState: string;
};

export type LendingPolicyInput = {
  action: LendingPolicyAction;
  item: LendingPolicyItem;
  requesterHouseholdId: string;
  ownerHouseholdId: string;
  relationshipBlocked: boolean;
  availability?: LendingAvailabilityDecision | null;
};

export type LendingPolicyDecision = {
  allowed: boolean;
  code: "allowed" | "policy_rejected";
  reasons: string[];
  rationale: string;
  terms: LendingTerms;
  paymentDeferred: true;
};

export type LendingPolicyGuardResult =
  | {
      status: "available";
      decision: LendingPolicyDecision;
      item: LendingPolicyItem;
      availability: LendingAvailabilityDecision | null;
    }
  | {
      status: "unavailable";
      decision: LendingPolicyDecision;
      reason: string;
      availability: LendingAvailabilityDecision | null;
    };

type LendingPolicyRow = {
  id: string;
  owner_household_id: string | null;
  category: string;
  title: string;
  quantity: string | number | null;
  item_state: string;
  metadata: Record<string, unknown> | string | null;
};

const LENDING_CATEGORIES = new Set(["fashion", "household"]);

function numberValue(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function rowToItem(row: LendingPolicyRow): LendingPolicyItem {
  return {
    id: row.id,
    ownerHouseholdId: row.owner_household_id,
    category: row.category,
    title: row.title,
    quantity: row.quantity,
    itemState: row.item_state,
    metadata: row.metadata,
  };
}

function rejectedDecision(reason: string): LendingPolicyDecision {
  const item: LendingPolicyItem = {
    id: "",
    ownerHouseholdId: null,
    category: "household",
    title: "Unavailable item",
    quantity: 0,
    itemState: "unknown",
    metadata: {},
  };

  return {
    allowed: false,
    code: "policy_rejected",
    reasons: [reason],
    rationale: reason,
    terms: normalizeLendingTerms(item),
    paymentDeferred: true,
  };
}

export function evaluateLendingPolicy(
  input: LendingPolicyInput,
): LendingPolicyDecision {
  const reasons: string[] = [];
  const terms = normalizeLendingTerms(input.item);

  if (!LENDING_CATEGORIES.has(input.item.category)) {
    reasons.push(
      input.item.category === "grocery"
        ? "Grocery items must use the food-sharing booking policy, not lending APIs."
        : `Category ${input.item.category} is not eligible for lending.`,
    );
  }

  if (input.item.itemState !== "listed") {
    reasons.push(`Item state is ${input.item.itemState}; lending requires a listed item.`);
  }

  if (!input.item.ownerHouseholdId) {
    reasons.push("Item owner household is unknown.");
  }

  if (numberValue(input.item.quantity) <= 0) {
    reasons.push("Item quantity must be available.");
  }

  if (input.requesterHouseholdId === input.ownerHouseholdId) {
    reasons.push("Requester and owner households must be different.");
  }

  if (input.relationshipBlocked) {
    reasons.push("A block exists between these households.");
  }

  if (input.availability && !input.availability.available) {
    reasons.push(...input.availability.reasons);
  }

  const uniqueReasons = [...new Set(reasons)];
  const allowed = uniqueReasons.length === 0;

  return {
    allowed,
    code: allowed ? "allowed" : "policy_rejected",
    reasons: uniqueReasons,
    rationale: allowed
      ? `${input.action} is allowed by lending category, listing, availability, terms, and block policy. ${terms.paymentDisclosure}`
      : uniqueReasons.join(" "),
    terms,
    paymentDeferred: true,
  };
}

async function loadLendingItem(itemId: string) {
  const result = await executeSql<LendingPolicyRow>({
    sql: `
      select
        id::text,
        owner_household_id::text,
        category::text,
        title,
        quantity,
        item_state::text,
        metadata
      from item_instances
      where id = :itemId::uuid
        and deleted_at is null
      limit 1
    `,
    parameters: [sqlParam("itemId", itemId)],
  });

  return result.rows[0] ? rowToItem(result.rows[0]) : null;
}

export async function checkLendingPolicyForItem(input: {
  action: LendingPolicyAction;
  itemId: string;
  requesterHouseholdId: string;
  ownerHouseholdId?: string | null;
  window?: Omit<LendingWindowInput, "itemId"> | null;
  bookingId?: string | null;
}): Promise<LendingPolicyGuardResult> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      decision: rejectedDecision("Lending policy guard is unavailable."),
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
      availability: null,
    };
  }

  try {
    const item = await loadLendingItem(input.itemId);
    if (!item) {
      return {
        status: "available",
        item: {
          id: input.itemId,
          ownerHouseholdId: input.ownerHouseholdId ?? null,
          category: "household",
          title: "Unavailable item",
          quantity: 0,
          itemState: "missing",
          metadata: {},
        },
        decision: rejectedDecision("Item is not available for lending."),
        availability: null,
      };
    }

    const ownerHouseholdId = input.ownerHouseholdId ?? item.ownerHouseholdId;
    if (!ownerHouseholdId) {
      return {
        status: "available",
        item,
        decision: evaluateLendingPolicy({
          action: input.action,
          item,
          requesterHouseholdId: input.requesterHouseholdId,
          ownerHouseholdId: "",
          relationshipBlocked: false,
          availability: null,
        }),
        availability: null,
      };
    }

    const block = await checkRelationshipBlock(input.requesterHouseholdId, ownerHouseholdId);
    if (block.status === "unavailable") {
      return {
        status: "unavailable",
        decision: rejectedDecision("Block relationship check is unavailable."),
        reason: block.reason,
        availability: null,
      };
    }

    const availabilityResult = input.window
      ? await checkLendingAvailability({
          itemId: input.itemId,
          windowStart: input.window.windowStart,
          windowEnd: input.window.windowEnd,
          excludeBookingId: input.bookingId ?? null,
        })
      : null;

    if (availabilityResult?.status === "unavailable") {
      return {
        status: "unavailable",
        decision: rejectedDecision("Lending availability check is unavailable."),
        reason: availabilityResult.reason,
        availability: availabilityResult.decision,
      };
    }

    const availability = availabilityResult?.decision ?? null;
    return {
      status: "available",
      item,
      decision: evaluateLendingPolicy({
        action: input.action,
        item,
        requesterHouseholdId: input.requesterHouseholdId,
        ownerHouseholdId,
        relationshipBlocked: block.blocked,
        availability,
      }),
      availability,
    };
  } catch (error) {
    return {
      status: "unavailable",
      decision: rejectedDecision("Lending policy guard is unavailable."),
      reason: publicErrorMessage(error),
      availability: null,
    };
  }
}

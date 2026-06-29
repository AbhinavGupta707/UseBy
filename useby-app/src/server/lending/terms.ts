export type LendingCategory = "fashion" | "household";

export type LendingTermsItem = {
  category: string;
  title?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | string | null;
};

export type LendingTerms = {
  size: string | null;
  condition: string;
  availabilityNote: string | null;
  cleaningTerms: string | null;
  returnTerms: string;
  depositPreference: string | null;
  paymentDisclosure: string;
  publicNotes: string[];
};

const DEFAULT_RETURN_TERMS =
  "Return the item in the same condition, at the agreed handoff time, using only coarse pickup details.";

const DEFAULT_CLEANING_TERMS: Record<LendingCategory, string> = {
  fashion: "Return freshly aired or cleaned as agreed with the owner.",
  household: "Return clean, dry, complete, and ready for the next neighbour.",
};

const PAYMENT_DEFERRED_DISCLOSURE =
  "Deposit preference is an owner note only. UseBy does not capture payment, and Stripe/payment ledger support is deferred.";

const DIRECT_CONTACT_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g,
  /(?:\+\s*)?(?:\d[\s().-]?){8,}\d\b/g,
  /\b(?:https?:\/\/|www\.)\S+\b/gi,
];

function metadataObject(value: LendingTermsItem["metadata"]): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return value;
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function metadataText(metadata: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = textValue(metadata[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

export function sanitizePublicLendingNote(value: unknown, maxLength = 240): string | null {
  const text = textValue(value);
  if (!text) {
    return null;
  }

  const redacted = DIRECT_CONTACT_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[redacted]"),
    text,
  )
    .replace(/\+\[redacted\]/g, "[redacted]")
    .replace(/\[redacted\](?=\S)/g, "[redacted] ")
    .replace(/\s+/g, " ")
    .trim();

  return redacted.length > maxLength
    ? `${redacted.slice(0, Math.max(0, maxLength - 1)).trim()}...`
    : redacted;
}

export function normalizeLendingCondition(value: unknown): string {
  const condition = textValue(value)?.toLowerCase();
  if (!condition) {
    return "condition not specified";
  }

  if (["new", "excellent", "good", "fair"].includes(condition)) {
    return condition;
  }

  return sanitizePublicLendingNote(condition, 80) ?? "condition not specified";
}

function extractDepositPreference(metadata: Record<string, unknown>, lendingTerms: string | null) {
  const explicit = metadataText(metadata, [
    "depositPreference",
    "depositNote",
    "deposit",
  ]);
  const candidate = explicit ?? lendingTerms;
  if (!candidate || !/deposit/i.test(candidate)) {
    return null;
  }

  return sanitizePublicLendingNote(candidate, 180);
}

function extractCleaningTerms(
  category: LendingCategory,
  metadata: Record<string, unknown>,
  lendingTerms: string | null,
) {
  const explicit = metadataText(metadata, [
    "cleaningTerms",
    "cleaningNote",
    "handlingTerms",
  ]);
  const candidate = explicit ?? (/clean|dry clean|wash|wipe/i.test(lendingTerms ?? "") ? lendingTerms : null);

  return sanitizePublicLendingNote(candidate, 220) ?? DEFAULT_CLEANING_TERMS[category];
}

function extractReturnTerms(metadata: Record<string, unknown>, lendingTerms: string | null) {
  const explicit = metadataText(metadata, [
    "returnTerms",
    "returnNote",
    "lendingTerms",
  ]);
  const candidate = explicit ?? lendingTerms;

  return sanitizePublicLendingNote(candidate, 260) ?? DEFAULT_RETURN_TERMS;
}

export function normalizeLendingTerms(item: LendingTermsItem): LendingTerms {
  const metadata = metadataObject(item.metadata);
  const category: LendingCategory = item.category === "fashion" ? "fashion" : "household";
  const lendingTerms = metadataText(metadata, ["lendingTerms", "terms"]);
  const conditionSource = metadata.condition ?? metadata.itemCondition;
  const availabilityNote = sanitizePublicLendingNote(
    metadataText(metadata, ["availabilityNote", "availability", "pickupHint"]),
    220,
  );
  const size = sanitizePublicLendingNote(metadataText(metadata, ["size", "fit"]), 80);
  const cleaningTerms = extractCleaningTerms(category, metadata, lendingTerms);
  const returnTerms = extractReturnTerms(metadata, lendingTerms);
  const depositPreference = extractDepositPreference(metadata, lendingTerms);

  return {
    size,
    condition: normalizeLendingCondition(conditionSource),
    availabilityNote,
    cleaningTerms,
    returnTerms,
    depositPreference,
    paymentDisclosure: PAYMENT_DEFERRED_DISCLOSURE,
    publicNotes: [
      availabilityNote,
      cleaningTerms,
      returnTerms,
      depositPreference
        ? `${depositPreference} ${PAYMENT_DEFERRED_DISCLOSURE}`
        : PAYMENT_DEFERRED_DISCLOSURE,
    ].filter((note): note is string => Boolean(note)),
  };
}

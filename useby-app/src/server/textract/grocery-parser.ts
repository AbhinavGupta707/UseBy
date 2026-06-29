import {
  AnalyzeExpenseCommand,
  DetectDocumentTextCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

import { loadRuntimeEnv } from "../db/env";

export type TextractIntakeKind = "receipt" | "expiry_label";
export type GroceryParsedLine = {
  title: string;
  rawText: string;
  quantity: number;
  unit: string;
  priceCents: number | null;
  useByDate: string | null;
  bestBeforeDate: string | null;
  labelRawText: string | null;
};

export type GroceryParsedDocument = {
  kind: TextractIntakeKind;
  provider: "textract";
  mode: "live" | "fixture" | "dry_run" | "unavailable";
  status: "parsed" | "unavailable" | "failed";
  merchantName: string | null;
  purchaseDate: string | null;
  rawText: string;
  lines: GroceryParsedLine[];
  fixture: boolean;
  reason?: string;
  rawProviderPayload?: Record<string, unknown>;
};

export type TextractSource = {
  kind: TextractIntakeKind;
  bucket?: string | null;
  objectKey?: string | null;
  rawText?: string | null;
  allowFixture?: boolean;
};

export function getTextractStatus() {
  const env = loadRuntimeEnv();
  const region = env.database?.region ?? process.env.AWS_REGION?.trim() ?? null;
  const bucket = env.storage?.bucket ?? process.env.AWS_S3_BUCKET?.trim() ?? null;
  const configured = Boolean(region && bucket);

  return {
    provider: "textract" as const,
    configured,
    region,
    requiresPrivateS3Object: true,
    mode: configured ? ("live" as const) : ("unavailable" as const),
    reason: configured
      ? null
      : "Textract requires AWS_REGION plus a private S3 bucket/object.",
  };
}

let cachedClient: TextractClient | undefined;

async function oidcCredentials() {
  const roleArn = process.env.AWS_ROLE_ARN?.trim();
  return roleArn ? awsCredentialsProvider({ roleArn }) : undefined;
}

async function getClient(region: string): Promise<TextractClient> {
  if (!cachedClient) {
    cachedClient = new TextractClient({
      region,
      credentials: await oidcCredentials(),
    });
  }

  return cachedClient;
}

function parseMoneyCents(value: string): number | null {
  const match = value.match(/(?:GBP|£)?\s*(\d+(?:\.\d{2})?)\b/i);
  if (!match) {
    return null;
  }

  return Math.round(Number(match[1]) * 100);
}

function monthNumber(month: string): string {
  const index = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(month.toLowerCase().slice(0, 3));

  return index >= 0 ? String(index + 1).padStart(2, "0") : "01";
}

export function parseExpiryDate(text: string): {
  useByDate: string | null;
  bestBeforeDate: string | null;
} {
  const normalized = text.replace(/\s+/g, " ");
  const iso = normalized.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const uk = normalized.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  const word = normalized.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/);
  const compact = normalized.match(/\b(\d{1,2})\s*([A-Za-z]{3})\s*(\d{2})\b/);

  let parsed: string | null = null;
  if (iso) {
    parsed = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  } else if (uk) {
    parsed = `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  } else if (word) {
    parsed = `${word[3]}-${monthNumber(word[2])}-${word[1].padStart(2, "0")}`;
  } else if (compact) {
    parsed = `20${compact[3]}-${monthNumber(compact[2])}-${compact[1].padStart(2, "0")}`;
  }

  if (!parsed) {
    return { useByDate: null, bestBeforeDate: null };
  }

  return /best\s*before/i.test(normalized)
    ? { useByDate: null, bestBeforeDate: parsed }
    : { useByDate: parsed, bestBeforeDate: null };
}

export function parseReceiptText(rawText: string): GroceryParsedLine[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const withoutPrice = line.replace(/\s+(?:GBP|£)?\d+(?:\.\d{2})\s*$/i, "").trim();
      return {
        title: withoutPrice || line,
        rawText: line,
        quantity: 1,
        unit: "each",
        priceCents: parseMoneyCents(line),
        ...parseExpiryDate(line),
        labelRawText: null,
      };
    })
    .filter((line) => !/^(subtotal|total|tax|vat)\b/i.test(line.title))
    .slice(0, 80);
}

function fixtureText(kind: TextractIntakeKind): string {
  return kind === "receipt"
    ? [
        "River Pantry",
        "BABY SPINACH 200G £1.80",
        "CLOSED CUP MUSHROOMS £1.60",
        "TORTILLA WRAPS 8PK £2.40",
        "GREEK YOGHURT 500G £2.20",
      ].join("\n")
    : "USE BY 02 JUL 2026";
}

function parsedFromText(
  kind: TextractIntakeKind,
  rawText: string,
  mode: GroceryParsedDocument["mode"],
  reason?: string,
): GroceryParsedDocument {
  if (kind === "expiry_label") {
    const expiry = parseExpiryDate(rawText);
    return {
      kind,
      provider: "textract",
      mode,
      status: "parsed",
      merchantName: null,
      purchaseDate: null,
      rawText,
      lines: [
        {
          title: "Expiry label observation",
          rawText,
          quantity: 1,
          unit: "each",
          priceCents: null,
          useByDate: expiry.useByDate,
          bestBeforeDate: expiry.bestBeforeDate,
          labelRawText: rawText,
        },
      ],
      fixture: mode !== "live",
      reason,
    };
  }

  return {
    kind,
    provider: "textract",
    mode,
    status: "parsed",
    merchantName: rawText.split(/\r?\n/).find(Boolean)?.slice(0, 160) ?? null,
    purchaseDate: null,
    rawText,
    lines: parseReceiptText(rawText),
    fixture: mode !== "live",
    reason,
  };
}

function extractExpenseText(response: unknown): string {
  const docs = (response as { ExpenseDocuments?: unknown[] }).ExpenseDocuments ?? [];
  const lines: string[] = [];

  for (const doc of docs) {
    const groups = (doc as { LineItemGroups?: unknown[] }).LineItemGroups ?? [];
    for (const group of groups) {
      const items = (group as { LineItems?: unknown[] }).LineItems ?? [];
      for (const item of items) {
        const fields = (item as { LineItemExpenseFields?: unknown[] }).LineItemExpenseFields ?? [];
        const text = fields
          .map((field) => (field as { ValueDetection?: { Text?: string } }).ValueDetection?.Text)
          .filter((value): value is string => Boolean(value))
          .join(" ");
        if (text) {
          lines.push(text);
        }
      }
    }
  }

  return lines.join("\n");
}

function extractDetectText(response: unknown): string {
  const blocks = (response as { Blocks?: unknown[] }).Blocks ?? [];
  return blocks
    .map((block) => {
      const candidate = block as { BlockType?: string; Text?: string };
      return candidate.BlockType === "LINE" ? candidate.Text : null;
    })
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export async function parseGroceryDocument(
  source: TextractSource,
): Promise<GroceryParsedDocument> {
  const env = loadRuntimeEnv();
  const region = env.database?.region ?? process.env.AWS_REGION?.trim();

  if (!source.bucket || !source.objectKey || !region) {
    if (source.allowFixture !== false) {
      return parsedFromText(
        source.kind,
        source.rawText?.trim() || fixtureText(source.kind),
        "fixture",
        "Live Textract unavailable because private S3 object or AWS region is missing.",
      );
    }

    return {
      kind: source.kind,
      provider: "textract",
      mode: "unavailable",
      status: "unavailable",
      merchantName: null,
      purchaseDate: null,
      rawText: source.rawText ?? "",
      lines: [],
      fixture: false,
      reason: "Live Textract unavailable because private S3 object or AWS region is missing.",
    };
  }

  try {
    const client = await getClient(region);
    const document = {
      S3Object: {
        Bucket: source.bucket,
        Name: source.objectKey,
      },
    };
    const response =
      source.kind === "receipt"
        ? await client.send(new AnalyzeExpenseCommand({ Document: document }))
        : await client.send(new DetectDocumentTextCommand({ Document: document }));
    const rawText =
      source.kind === "receipt"
        ? extractExpenseText(response) || source.rawText || ""
        : extractDetectText(response) || source.rawText || "";

    return {
      ...parsedFromText(source.kind, rawText, "live"),
      rawProviderPayload: JSON.parse(JSON.stringify(response)),
    };
  } catch (error) {
    if (source.allowFixture !== false) {
      return parsedFromText(
        source.kind,
        source.rawText?.trim() || fixtureText(source.kind),
        "fixture",
        error instanceof Error ? error.message : "Live Textract failed; fixture parse used.",
      );
    }

    return {
      kind: source.kind,
      provider: "textract",
      mode: "unavailable",
      status: "failed",
      merchantName: null,
      purchaseDate: null,
      rawText: source.rawText ?? "",
      lines: [],
      fixture: false,
      reason: error instanceof Error ? error.message : "Live Textract failed.",
    };
  }
}

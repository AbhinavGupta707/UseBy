import { createHash, randomUUID } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

import { loadRuntimeEnv } from "../db/env";

export type PrivateStorageStatus =
  | {
      available: true;
      provider: "s3";
      bucket: string;
      region: string;
      mode: "live";
      reason?: never;
    }
  | {
      available: false;
      provider: "s3";
      bucket: string | null;
      region: string | null;
      mode: "unavailable";
      reason: string;
    };

export type PrivateUploadResult =
  | {
      ok: true;
      provider: "s3";
      mode: "live";
      bucket: string;
      objectKey: string;
      sha256: string;
      byteSize: number;
      contentType: string;
    }
  | {
      ok: false;
      provider: "s3";
      mode: "unavailable";
      bucket: string | null;
      reason: string;
    };

export type PrivateUploadInput = {
  householdId: string;
  demoScope: string;
  role: "receipt" | "expiry_label";
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
};

let cachedClient: S3Client | undefined;

function safeFileName(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "upload.bin";
}

async function oidcCredentials() {
  const roleArn = process.env.AWS_ROLE_ARN?.trim();
  return roleArn ? awsCredentialsProvider({ roleArn }) : undefined;
}

async function getClient(region: string): Promise<S3Client> {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region,
      credentials: await oidcCredentials(),
    });
  }

  return cachedClient;
}

export function getPrivateStorageStatus(): PrivateStorageStatus {
  const env = loadRuntimeEnv();
  const region = env.database?.region ?? process.env.AWS_REGION?.trim() ?? null;

  if (!env.storageConfigured || !env.storage || !region) {
    const missing = [
      !region ? "AWS_REGION" : null,
      !env.storage?.bucket ? "AWS_S3_BUCKET" : null,
    ].filter((value): value is string => Boolean(value));

    return {
      available: false,
      provider: "s3",
      bucket: env.storage?.bucket ?? null,
      region,
      mode: "unavailable",
      reason: `S3 private storage env missing: ${missing.join(", ")}`,
    };
  }

  return {
    available: true,
    provider: "s3",
    bucket: env.storage.bucket,
    region,
    mode: "live",
  };
}

export async function uploadPrivateFile(
  input: PrivateUploadInput,
): Promise<PrivateUploadResult> {
  const status = getPrivateStorageStatus();
  if (!status.available) {
    return {
      ok: false,
      provider: "s3",
      mode: "unavailable",
      bucket: status.bucket,
      reason: status.reason,
    };
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const objectKey = [
    "private",
    input.demoScope,
    input.householdId,
    input.role,
    `${new Date().toISOString().slice(0, 10)}-${randomUUID()}-${safeFileName(input.fileName)}`,
  ].join("/");

  try {
    const client = await getClient(status.region);
    await client.send(
      new PutObjectCommand({
        Bucket: status.bucket,
        Key: objectKey,
        Body: input.bytes,
        ContentType: input.contentType,
        Metadata: {
          usebyRole: input.role,
          usebyPrivate: "true",
          sha256,
        },
        ServerSideEncryption: "AES256",
      }),
    );

    return {
      ok: true,
      provider: "s3",
      mode: "live",
      bucket: status.bucket,
      objectKey,
      sha256,
      byteSize: input.bytes.byteLength,
      contentType: input.contentType,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "s3",
      mode: "unavailable",
      bucket: status.bucket,
      reason: error instanceof Error ? error.message : "S3 upload failed.",
    };
  }
}

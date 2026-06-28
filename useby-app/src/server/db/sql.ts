import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  type Field,
  type RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { loadRuntimeEnv, type DatabaseRuntimeConfig } from "./env";

export type SqlValue =
  | string
  | number
  | boolean
  | Date
  | null
  | Record<string, unknown>
  | unknown[];

export type QueryRow = Record<string, unknown>;

export type QueryResult<Row extends QueryRow = QueryRow> = {
  rows: Row[];
  recordsUpdated: number;
};

export type ExecuteSqlOptions = {
  sql: string;
  parameters?: SqlParameter[];
  transactionId?: string;
  config?: DatabaseRuntimeConfig;
  client?: RDSDataClient;
  retry?: RetryOptions;
};

export type TransactionContext = {
  transactionId: string;
  config: DatabaseRuntimeConfig;
  client?: RDSDataClient;
};

type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
};

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 4,
  baseDelayMs: 250,
};

let cachedClient: RDSDataClient | undefined;

async function getRdsDataClient(region: string): Promise<RDSDataClient> {
  if (!cachedClient) {
    const { RDSDataClient } = await import("@aws-sdk/client-rds-data");
    cachedClient = new RDSDataClient({ region });
  }

  return cachedClient;
}

export function sqlParam(name: string, value: SqlValue): SqlParameter {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL parameter name: ${name}`);
  }

  if (value === null || value === undefined) {
    return { name, value: { isNull: true } };
  }

  if (value instanceof Date) {
    return {
      name,
      typeHint: "TIMESTAMP",
      value: { stringValue: value.toISOString() },
    };
  }

  if (typeof value === "string") {
    return { name, value: { stringValue: value } };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { name, value: { longValue: value } };
    }

    return { name, value: { doubleValue: value } };
  }

  if (typeof value === "boolean") {
    return { name, value: { booleanValue: value } };
  }

  return {
    name,
    typeHint: "JSON",
    value: { stringValue: JSON.stringify(value) },
  };
}

export function isDatabaseResumingOrTransient(error: unknown): boolean {
  const candidate = error as { name?: string; message?: string; code?: string };
  const name = candidate.name ?? candidate.code ?? "";
  const message = candidate.message ?? "";

  return [
    "DatabaseResumingException",
    "DatabaseUnavailableException",
    "ServiceUnavailableException",
    "ThrottlingException",
    "TooManyRequestsException",
  ].some((needle) => name.includes(needle) || message.includes(needle));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retry: RetryOptions = {},
): Promise<T> {
  const options = { ...DEFAULT_RETRY, ...retry };
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (
        attempt >= options.maxAttempts ||
        !isDatabaseResumingOrTransient(error)
      ) {
        throw error;
      }

      await sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function getDatabaseConfig(config?: DatabaseRuntimeConfig): DatabaseRuntimeConfig {
  if (config) {
    return config;
  }

  const env = loadRuntimeEnv();
  if (!env.database) {
    throw new Error(
      `Aurora Data API is not configured. Missing: ${env.missing.join(", ")}`,
    );
  }

  return env.database;
}

function fieldValue(field: Field | undefined): unknown {
  if (!field || field.isNull) {
    return null;
  }

  if ("stringValue" in field) {
    return field.stringValue ?? null;
  }

  if ("longValue" in field) {
    return field.longValue ?? null;
  }

  if ("doubleValue" in field) {
    return field.doubleValue ?? null;
  }

  if ("booleanValue" in field) {
    return field.booleanValue ?? null;
  }

  if ("blobValue" in field) {
    return field.blobValue ?? null;
  }

  if ("arrayValue" in field) {
    return field.arrayValue ?? null;
  }

  return null;
}

export async function executeSql<Row extends QueryRow = QueryRow>({
  sql,
  parameters = [],
  transactionId,
  config,
  client,
  retry,
}: ExecuteSqlOptions): Promise<QueryResult<Row>> {
  const database = getDatabaseConfig(config);
  const rdsClient = client ?? (await getRdsDataClient(database.region));

  const response = await withRetry(
    () =>
      rdsClient.send(
        new ExecuteStatementCommand({
          resourceArn: database.clusterArn,
          secretArn: database.secretArn,
          database: database.database,
          sql,
          parameters,
          transactionId,
          includeResultMetadata: true,
        }),
      ),
    retry,
  );

  const columns =
    response.columnMetadata?.map((column, index) => column.name ?? `col${index}`) ??
    [];
  const rows = (response.records ?? []).map((record) =>
    record.reduce<QueryRow>((row, field, index) => {
      row[columns[index] ?? `col${index}`] = fieldValue(field);
      return row;
    }, {}),
  ) as Row[];

  return {
    rows,
    recordsUpdated: response.numberOfRecordsUpdated ?? 0,
  };
}

export async function withTransaction<T>(
  operation: (context: TransactionContext) => Promise<T>,
  options: Omit<ExecuteSqlOptions, "sql" | "parameters" | "transactionId"> = {},
): Promise<T> {
  const database = getDatabaseConfig(options.config);
  const rdsClient = options.client ?? (await getRdsDataClient(database.region));

  const begin = await withRetry(
    () =>
      rdsClient.send(
        new BeginTransactionCommand({
          resourceArn: database.clusterArn,
          secretArn: database.secretArn,
          database: database.database,
        }),
      ),
    options.retry,
  );

  if (!begin.transactionId) {
    throw new Error("Aurora Data API did not return a transaction id.");
  }

  try {
    const result = await operation({
      transactionId: begin.transactionId,
      config: database,
      client: rdsClient,
    });

    await withRetry(
      () =>
        rdsClient.send(
          new CommitTransactionCommand({
            resourceArn: database.clusterArn,
            secretArn: database.secretArn,
            transactionId: begin.transactionId,
          }),
        ),
      options.retry,
    );

    return result;
  } catch (error) {
    await rdsClient.send(
      new RollbackTransactionCommand({
        resourceArn: database.clusterArn,
        secretArn: database.secretArn,
        transactionId: begin.transactionId,
      }),
    );
    throw error;
  }
}

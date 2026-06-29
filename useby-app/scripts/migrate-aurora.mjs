import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index);
    let value = line.slice(index + 1);

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function firstPresent(values) {
  for (const value of values) {
    if (value) {
      return value;
    }
  }

  return "";
}

const cwd = process.cwd();
const envPath = process.env.USEBY_ENV_FILE ? path.resolve(process.env.USEBY_ENV_FILE) : path.join(cwd, ".env.local");
const fileEnv = parseEnvFile(envPath);

if (process.env.USEBY_MIGRATION_DEBUG_NAMES === "1") {
  console.log(JSON.stringify({
    cwd,
    envPathExists: fs.existsSync(envPath),
    auroraEnvNames: Object.keys(fileEnv).filter((key) => key.includes("AURORA")).sort(),
    auroraValuePresence: {
      database: Boolean(fileEnv.AURORA_DATABASE),
      cluster: Boolean(fileEnv.AURORA_CLUSTER_ARN),
      secret: Boolean(fileEnv.AURORA_SECRET_ARN),
    },
  }));
}

const secretArn = firstPresent([
  process.env.AURORA_MASTER_SECRET_ARN,
  fileEnv.AURORA_MASTER_SECRET_ARN,
  process.env.AURORA_APP_SECRET_ARN,
  fileEnv.AURORA_APP_SECRET_ARN,
  process.env.AURORA_SECRET_ARN,
  fileEnv.AURORA_SECRET_ARN,
]);

const required = [];

const databaseName = firstPresent([process.env.AURORA_DATABASE, fileEnv.AURORA_DATABASE]);
const clusterArn = firstPresent([process.env.AURORA_CLUSTER_ARN, fileEnv.AURORA_CLUSTER_ARN]);

if (!databaseName) {
  required.push("AURORA_DATABASE");
}

if (!clusterArn) {
  required.push("AURORA_CLUSTER_ARN");
}

if (!secretArn) {
  required.push("AURORA_MASTER_SECRET_ARN, AURORA_APP_SECRET_ARN, or AURORA_SECRET_ARN");
}

if (required.length > 0) {
  console.error(`Missing Aurora migration env names: ${required.join(", ")}`);
  process.exit(2);
}

console.log("Running drizzle migration with configured Aurora env names; secret values are not printed.");

const result = spawnSync("npx", ["drizzle-kit", "migrate", "--config=drizzle.config.ts"], {
  cwd,
  env: {
    ...process.env,
    ...fileEnv,
    AURORA_DATABASE: databaseName,
    AURORA_CLUSTER_ARN: clusterArn,
    AURORA_APP_SECRET_ARN: secretArn,
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);

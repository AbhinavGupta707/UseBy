import { defineConfig } from "drizzle-kit";

const database = process.env.AURORA_DATABASE;
const resourceArn = process.env.AURORA_CLUSTER_ARN;
const secretArn = process.env.AURORA_MASTER_SECRET_ARN ?? process.env.AURORA_APP_SECRET_ARN;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  driver: "aws-data-api",
  dbCredentials: {
    database: database ?? "",
    resourceArn: resourceArn ?? "",
    secretArn: secretArn ?? "",
  },
  strict: true,
  verbose: true,
});

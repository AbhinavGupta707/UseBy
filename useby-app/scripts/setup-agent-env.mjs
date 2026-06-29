#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

const APP_ROOT = process.cwd();
const ENV_PATH = path.join(APP_ROOT, ".env.local");
const BEGIN = "# BEGIN USEBY AGENT ENV";
const END = "# END USEBY AGENT ENV";
const DEFAULT_FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";
const DEFAULT_FIREWORKS_MODEL = "accounts/fireworks/models/kimi-k2p5";
const DEFAULT_LANGSMITH_ENDPOINT = "https://api.smith.langchain.com";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function yes(value) {
  return ["", "y", "yes"].includes(value.trim().toLowerCase());
}

async function ask(question, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  return answer.trim() || fallback;
}

async function askSecret(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const answer = await rl.question(`${question}: `);
    return answer.trim();
  }

  process.stdout.write(`${question}: `);
  spawnSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });

  try {
    const answer = await rl.question("");
    return answer.trim();
  } finally {
    spawnSync("stty", ["echo"], { stdio: ["inherit", "ignore", "ignore"] });
    process.stdout.write("\n");
  }
}

function renderEnv(values) {
  const ordered = [
    ["FIREWORKS_API_KEY", values.fireworksApiKey],
    ["FIREWORKS_BASE_URL", values.fireworksBaseUrl],
    ["FIREWORKS_CHAT_MODEL", values.fireworksChatModel],
    ["FIREWORKS_EMBEDDING_MODEL", values.fireworksEmbeddingModel],
    ["FIREWORKS_RERANKER_MODEL", values.fireworksRerankerModel],
    ["AI_COPY_ENABLED", "true"],
    ["AI_COPY_PROVIDER", "fireworks"],
    ["AI_COPY_API_BASE_URL", values.fireworksBaseUrl],
    ["AI_COPY_API_KEY", values.fireworksApiKey],
    ["AI_COPY_MODEL", values.fireworksChatModel],
    ["AI_SEMANTIC_RANKING_ENABLED", "false"],
    ["LANGSMITH_TRACING", "true"],
    ["LANGSMITH_ENDPOINT", values.langsmithEndpoint],
    ["LANGSMITH_API_KEY", values.langsmithApiKey],
    ["LANGSMITH_PROJECT", values.langsmithProject],
    ["LANGCHAIN_TRACING_V2", "true"],
    ["LANGCHAIN_ENDPOINT", values.langsmithEndpoint],
    ["LANGCHAIN_API_KEY", values.langsmithApiKey],
    ["LANGCHAIN_PROJECT", values.langsmithProject],
  ];

  return [
    BEGIN,
    "# Managed by `npm run setup:agent-env`. Do not commit real secrets.",
    ...ordered.map(([name, value]) => `${name}=${value}`),
    END,
    "",
  ].join("\n");
}

function replaceManagedBlock(existing, block) {
  const start = existing.indexOf(BEGIN);
  const finish = existing.indexOf(END);

  if (start >= 0 && finish > start) {
    return `${existing.slice(0, start).trimEnd()}\n\n${block}${existing
      .slice(finish + END.length)
      .trimStart()}`;
  }

  return `${existing.trimEnd()}\n\n${block}`;
}

async function updateLocalEnv(values) {
  const existing = existsSync(ENV_PATH) ? await readFile(ENV_PATH, "utf8") : "";
  await writeFile(ENV_PATH, replaceManagedBlock(existing, renderEnv(values)));
  console.log(`Updated ${ENV_PATH}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const stdio =
      options.input === undefined
        ? options.quiet
          ? ["ignore", "ignore", "ignore"]
          : "inherit"
        : options.quiet
          ? ["pipe", "ignore", "ignore"]
          : ["pipe", "inherit", "inherit"];
    const child = spawn(command, args, {
      cwd: APP_ROOT,
      stdio,
    });

    if (options.input !== undefined) {
      child.stdin.end(`${options.input}\n`);
    }

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function pushVercelEnv(values, target) {
  const entries = [
    ["FIREWORKS_API_KEY", values.fireworksApiKey],
    ["FIREWORKS_BASE_URL", values.fireworksBaseUrl],
    ["FIREWORKS_CHAT_MODEL", values.fireworksChatModel],
    ["FIREWORKS_EMBEDDING_MODEL", values.fireworksEmbeddingModel],
    ["FIREWORKS_RERANKER_MODEL", values.fireworksRerankerModel],
    ["AI_COPY_ENABLED", "true"],
    ["AI_COPY_PROVIDER", "fireworks"],
    ["AI_COPY_API_BASE_URL", values.fireworksBaseUrl],
    ["AI_COPY_API_KEY", values.fireworksApiKey],
    ["AI_COPY_MODEL", values.fireworksChatModel],
    ["AI_SEMANTIC_RANKING_ENABLED", "false"],
    ["LANGSMITH_TRACING", "true"],
    ["LANGSMITH_ENDPOINT", values.langsmithEndpoint],
    ["LANGSMITH_API_KEY", values.langsmithApiKey],
    ["LANGSMITH_PROJECT", values.langsmithProject],
    ["LANGCHAIN_TRACING_V2", "true"],
    ["LANGCHAIN_ENDPOINT", values.langsmithEndpoint],
    ["LANGCHAIN_API_KEY", values.langsmithApiKey],
    ["LANGCHAIN_PROJECT", values.langsmithProject],
  ];

  console.log(`Checking Vercel login/project for ${target}...`);
  const whoami = await run("npx", ["vercel", "whoami"]);
  if (whoami !== 0) {
    throw new Error("Vercel CLI is not logged in. Run `npx vercel login`, then rerun this setup.");
  }

  for (const [name, value] of entries) {
    console.log(`Setting Vercel ${target} env: ${name}`);
    await run("npx", ["vercel", "env", "rm", name, target, "--yes"], { quiet: true });
    const code = await run("npx", ["vercel", "env", "add", name, target], { input: value });
    if (code !== 0) {
      throw new Error(`Failed to set Vercel env ${name}.`);
    }
  }
}

async function main() {
  console.log("UseBy agent env setup");
  console.log("Secrets are hidden while typing and are not printed by this script.");

  const fireworksApiKey = await askSecret("Fireworks API key");
  if (!fireworksApiKey) {
    throw new Error("Fireworks API key is required.");
  }

  const langsmithApiKey = await askSecret("LangSmith API key");
  if (!langsmithApiKey) {
    throw new Error("LangSmith API key is required.");
  }

  const values = {
    fireworksApiKey,
    langsmithApiKey,
    fireworksBaseUrl: await ask("Fireworks OpenAI-compatible base URL", DEFAULT_FIREWORKS_BASE_URL),
    fireworksChatModel: await ask("Fireworks chat/tool model slug", DEFAULT_FIREWORKS_MODEL),
    fireworksEmbeddingModel: await ask("Fireworks embedding model slug", "fireworks/qwen3-embedding-8b"),
    fireworksRerankerModel: await ask("Fireworks reranker model slug", "fireworks/qwen3-reranker-8b"),
    langsmithEndpoint: await ask("LangSmith endpoint", DEFAULT_LANGSMITH_ENDPOINT),
    langsmithProject: await ask("LangSmith project", "useby-live"),
  };

  await mkdir(APP_ROOT, { recursive: true });
  await updateLocalEnv(values);

  const push = yes(await ask("Push these env vars to Vercel now? y/N", "n"));
  if (push) {
    const target = await ask("Vercel environment", "production");
    await pushVercelEnv(values, target);
    console.log("Vercel env setup complete.");

    const deploy = yes(await ask("Redeploy Vercel now? y/N", "n"));
    if (deploy) {
      const deployArgs = target === "production" ? ["vercel", "--prod"] : ["vercel"];
      const code = await run("npx", deployArgs);
      if (code !== 0) {
        throw new Error("Vercel deploy failed.");
      }
    }
  } else {
    console.log("Skipped Vercel env push. Local env setup is complete.");
  }

  console.log("Done. Keep .env.local private.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });

#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

export const requiredObservability = {
  enabled: true,
  logs: { enabled: true, invocation_logs: true },
};

export function applyRequiredObservability(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Generated staging web configuration is invalid.");
  }

  return { ...config, observability: requiredObservability };
}

export function updateGeneratedConfig(path) {
  let config;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("Generated staging web configuration is unavailable.");
  }

  writeFileSync(path, `${JSON.stringify(applyRequiredObservability(config), null, 2)}\n`);
}

if (import.meta.main) {
  try {
    const path = process.argv[2];
    if (!path) throw new Error("Generated staging web configuration path is required.");
    updateGeneratedConfig(path);
    console.log("Required staging web observability was applied to the generated Worker configuration.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Generated staging web configuration is unavailable.");
    process.exitCode = 1;
  }
}

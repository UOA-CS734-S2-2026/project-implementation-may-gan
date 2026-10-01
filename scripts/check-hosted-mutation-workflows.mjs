#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const workflowPolicy = {
  "ci.yml": {
    jobs: {
      typescript: "local",
      "web-e2e": "local",
      "contracts-and-flutter": "local",
      "postgres-integration": "local",
    },
  },
  "cleanup-hyperdrive-preview.yml": {
    jobs: { "hosted-mutation-authorization": "guard", cleanup: "mutation" },
  },
  "database-migrations.yml": { jobs: { "database-migrations": "local" } },
  "run-database-migrations.yml": {
    jobs: { "hosted-mutation-authorization": "guard", migrate: "mutation" },
    authorizedCheckoutJobs: ["migrate"],
  },
  "staging-hyperdrive.yml": {
    jobs: { "hosted-mutation-authorization": "guard", deploy: "mutation" },
    authorizedCheckoutJobs: ["deploy"],
    reusable: true,
  },
  "staging-release.yml": {
    jobs: {
      "hosted-mutation-authorization": "guard",
      capture: "capture",
      api: "reusable-mutation",
      web: "reusable-mutation",
    },
    requiresTrustedWorkflowRun: true,
  },
  "staging-web.yml": {
    jobs: { "hosted-mutation-authorization": "guard", deploy: "mutation" },
    authorizedCheckoutJobs: ["deploy"],
    reusable: true,
  },
};

function fail(errors, message) {
  errors.push(message);
}

function readYaml(path) {
  const document = parseDocument(readFileSync(path, "utf8"), { version: "1.2" });
  if (document.errors.length > 0) throw new Error(`${path}: ${document.errors[0].message}`);
  const value = document.toJS();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: workflow must be an object.`);
  return value;
}

function sortedKeys(value) {
  return Object.keys(value ?? {}).sort();
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasSecretReference(value) {
  return /\$\{\{\s*secrets\./.test(JSON.stringify(value));
}

function hasIdTokenWrite(job) {
  return job.permissions?.["id-token"] === "write";
}

function packageScripts(repositoryRoot) {
  const scripts = new Map();

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      if (entry.isFile() && entry.name === "package.json") {
        const packageJson = JSON.parse(readFileSync(path, "utf8"));
        const key = relative(repositoryRoot, directory) || ".";
        scripts.set(key, packageJson.scripts ?? {});
        if (packageJson.name) scripts.set(`name:${packageJson.name}`, packageJson.scripts ?? {});
      }
    }
  }

  visit(repositoryRoot);
  return scripts;
}

function scriptSignals(command, workingDirectory, scripts, visited = new Set()) {
  const signals = new Set();
  if (/\bwrangler\s+deploy\b/.test(command)) signals.add("wrangler-deploy");
  if (/\bwrangler\s+delete\b/.test(command)) signals.add("wrangler-delete");
  if (/sync-staging-api-secrets\.mjs/.test(command)) signals.add("worker-secret-sync");
  if (/test:hyperdrive:staging/.test(command)) signals.add("hyperdrive-proof");

  const invocation = command.match(/\bpnpm(?:\s+--dir\s+([^\s]+)|\s+--filter\s+([^\s]+))?\s+(?:run\s+)?([A-Za-z][A-Za-z0-9:_-]*)\b/);
  if (!invocation || invocation[3] === "exec") return signals;

  const [, directory, packageName, scriptName] = invocation;
  const packageKey = packageName ? `name:${packageName}` : directory ? directory.replace(/^\.\//, "") : workingDirectory;
  const definition = scripts.get(packageKey)?.[scriptName];
  const visitKey = `${packageKey}:${scriptName}`;
  if (!definition || visited.has(visitKey)) return signals;
  visited.add(visitKey);
  for (const signal of scriptSignals(definition, packageKey, scripts, visited)) signals.add(signal);
  return signals;
}

function mutationSignals(job, scripts) {
  const signals = new Set();
  const jobWorkingDirectory = job["working-directory"] ?? ".";
  for (const step of job.steps ?? []) {
    if (typeof step.run !== "string") continue;
    const workingDirectory = step["working-directory"] ?? jobWorkingDirectory;
    for (const signal of scriptSignals(step.run, workingDirectory, scripts)) signals.add(signal);
  }
  if (/\bdb:migrate\b/.test(JSON.stringify(job)) && hasSecretReference(job)) signals.add("hosted-database-migration");
  if (/\bDELETE\b/.test(JSON.stringify(job)) && /CLOUDFLARE_API_TOKEN/.test(JSON.stringify(job))) signals.add("cloudflare-delete");
  return signals;
}

function requireCiHostedMutationHoldTest(workflow, filename, errors) {
  const steps = workflow.jobs?.typescript?.steps;
  if (!Array.isArray(steps) || !steps.some((step) => step.run === "pnpm test:hosted-mutation-hold")) {
    fail(errors, `${filename}: the TypeScript job must run the hosted mutation hold test.`);
  }
}

function requireTrustedWorkflowRun(workflow, guard, mutation, filename, errors) {
  const trigger = workflow.on?.workflow_run;
  const branches = Array.isArray(trigger?.branches) ? [...trigger.branches].sort() : [];
  if (workflow.on?.workflow_dispatch?.inputs?.commit_sha) {
    fail(errors, `${filename}: manual dispatch must not accept an unchecked rollback SHA.`);
  }
  if (!trigger || !sameStrings(branches, ["main"])) {
    fail(errors, `${filename}: workflow_run must be restricted to main.`);
  }
  const condition = String(guard.if ?? "");
  if (!condition.includes("github.event.workflow_run.head_branch == 'main'")
    || !condition.includes("github.event.workflow_run.head_repository.full_name == github.repository")) {
    fail(errors, `${filename}: the mutation job must reject workflow_run events from forks and non-main branches.`);
  }
  const checkout = (guard?.steps ?? []).find((step) => step.uses === "actions/checkout@v4");
  if (checkout?.with?.ref !== "refs/heads/main") {
    fail(errors, `${filename}: the guard must check out the live main ref.`);
  }
  const authorization = (guard?.steps ?? []).find((step) => String(step.run ?? "").includes("check-hosted-mutation-authorization.mjs"));
  if (!String(authorization?.env?.EXPECTED_SHA ?? "").includes("github.event.workflow_run.head_sha")) {
    fail(errors, `${filename}: the guard must compare workflow_run.head_sha to the live main ref.`);
  }
}

export function auditHostedMutationWorkflows(repositoryRoot = process.cwd()) {
  const workflowsDirectory = join(repositoryRoot, ".github", "workflows");
  const errors = [];
  const filenames = readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/.test(name)).sort();
  const expectedFiles = Object.keys(workflowPolicy).sort();
  if (!sameStrings(filenames, expectedFiles)) {
    fail(errors, `Workflow files are not classified. Expected ${expectedFiles.join(", ")}; found ${filenames.join(", ")}.`);
  }

  const scripts = packageScripts(repositoryRoot);
  for (const filename of filenames) {
    const policy = workflowPolicy[filename];
    if (!policy) continue;
    const workflow = readYaml(join(workflowsDirectory, filename));
    const jobs = workflow.jobs;
    if (!jobs || typeof jobs !== "object") {
      fail(errors, `${filename}: jobs must be an object.`);
      continue;
    }
    const expectedJobs = sortedKeys(policy.jobs);
    const actualJobs = sortedKeys(jobs);
    if (!sameStrings(actualJobs, expectedJobs)) {
      fail(errors, `${filename}: jobs are not classified. Expected ${expectedJobs.join(", ")}; found ${actualJobs.join(", ")}.`);
    }

    for (const [jobName, job] of Object.entries(jobs)) {
      const classification = policy.jobs[jobName];
      if (!classification) continue;
      const signals = mutationSignals(job, scripts);
      if (classification === "mutation") {
        const needs = Array.isArray(job.needs) ? job.needs : [job.needs].filter(Boolean);
        if (!needs.includes("hosted-mutation-authorization")
          || !String(job.if ?? "").includes("needs.hosted-mutation-authorization.outputs.authorized == 'true'")) {
          fail(errors, `${filename}:${jobName} must depend on an explicit authorization result.`);
        }
        if (!job.environment) fail(errors, `${filename}:${jobName} must use a protected environment.`);
        if (signals.size === 0) fail(errors, `${filename}:${jobName} has no recognized hosted mutation signal.`);
        if (policy.authorizedCheckoutJobs?.includes(jobName)) {
          const checkout = (job.steps ?? []).find((step) => step.uses === "actions/checkout@v4");
          if (checkout?.with?.ref !== "${{ needs.hosted-mutation-authorization.outputs.target_sha }}") {
            fail(errors, `${filename}:${jobName} must check out the authorized commit.`);
          }
        }
      } else if (classification === "capture") {
        if (!String(job.needs ?? "").includes("hosted-mutation-authorization")
          || !String(job.if ?? "").includes("needs.hosted-mutation-authorization.outputs.authorized == 'true'")) {
          fail(errors, `${filename}:${jobName} must depend on the authorization guard.`);
        }
        if (!job.environment) fail(errors, `${filename}:${jobName} must capture protected staging mode after authorization.`);
        if (hasSecretReference(job) || hasIdTokenWrite(job)) fail(errors, `${filename}:${jobName} exposes credentials before deployment.`);
      } else if (classification === "reusable-mutation") {
        const needs = Array.isArray(job.needs) ? job.needs : [job.needs].filter(Boolean);
        if (!needs.includes("capture") || job.secrets !== "inherit" || !String(job.uses ?? "").startsWith("./.github/workflows/")) {
          fail(errors, `${filename}:${jobName} must call a guarded reusable workflow after capture.`);
        }
      } else {
        if (hasSecretReference(job)) fail(errors, `${filename}:${jobName} exposes a secret before authorization.`);
        if (hasIdTokenWrite(job)) fail(errors, `${filename}:${jobName} can mint an OIDC token before authorization.`);
        if (job.environment) fail(errors, `${filename}:${jobName} uses an environment before authorization.`);
        if (signals.size > 0) fail(errors, `${filename}:${jobName} has hosted mutation signals but is not classified as a mutation.`);
      }

      if (classification === "guard") {
        if (job.permissions?.contents !== "read" || Object.keys(job.permissions ?? {}).length !== 1) {
          fail(errors, `${filename}:${jobName} must have only contents: read permission.`);
        }
        const guardCheckout = (job.steps ?? []).find((step) => step.uses === "actions/checkout@v4");
        if (guardCheckout?.with?.ref !== "refs/heads/main" || guardCheckout.with?.["fetch-depth"] !== 0) {
          fail(errors, `${filename}:${jobName} must fully check out the live main ref.`);
        }
        if (!(job.steps ?? []).some((step) => String(step.run ?? "").includes("check-hosted-mutation-authorization.mjs"))) {
          fail(errors, `${filename}:${jobName} does not execute the authorization check.`);
        }
        if (job.outputs?.target_sha !== "${{ steps.authorization.outputs.target_sha }}") {
          fail(errors, `${filename}:${jobName} does not expose the authorized commit.`);
        }
      }
    }

    if (filename === "ci.yml") requireCiHostedMutationHoldTest(workflow, filename, errors);
    if (policy.requiresTrustedWorkflowRun) {
      requireTrustedWorkflowRun(workflow, jobs["hosted-mutation-authorization"], jobs.capture, filename, errors);
      const api = jobs.api;
      const web = jobs.web;
      if (api?.uses !== "./.github/workflows/staging-hyperdrive.yml" || web?.uses !== "./.github/workflows/staging-web.yml"
        || !String(web.needs ?? "").includes("api")
        || api.with?.commit_sha !== "${{ needs.capture.outputs.commit_sha }}"
        || web.with?.commit_sha !== "${{ needs.capture.outputs.commit_sha }}"
        || api.with?.browser_proxy_enabled !== "${{ needs.capture.outputs.browser_proxy_enabled }}"
        || web.with?.browser_proxy_enabled !== "${{ needs.capture.outputs.browser_proxy_enabled }}") {
        fail(errors, `${filename}: API then web must use the same captured release contract.`);
      }
    }
    if (policy.reusable) {
      const deploy = jobs.deploy;
      if (!String(deploy.needs ?? "").includes("hosted-mutation-authorization")
        || !String(deploy.if ?? "").includes("needs.hosted-mutation-authorization.outputs.authorized == 'true'")) {
        fail(errors, `${filename}: the reusable deployment must require its own guard.`);
      }
    }
  }

  if (errors.length > 0) throw new Error(`Hosted mutation workflow audit failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  if (!existsSync(join(root, ".github", "workflows"))) throw new Error("A repository root with .github/workflows is required.");
  auditHostedMutationWorkflows(root);
  console.log("Hosted mutation workflow audit passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

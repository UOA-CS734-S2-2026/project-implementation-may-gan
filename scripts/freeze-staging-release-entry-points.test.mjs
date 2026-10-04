import assert from "node:assert/strict";
import test from "node:test";
import { freezeStagingReleaseEntryPoints, STAGING_RELEASE_WORKFLOWS } from "./freeze-staging-release-entry-points.mjs";

function githubFor(runs, { completeInProgressOnPause = true, queuedBecomesInProgress = false } = {}) {
  const disabled = new Set();
  const cancelled = [];
  const disableCalls = [];
  const listWorkflowRuns = async ({ workflow_id, status }) => ({
    data: { workflow_runs: runs.filter((run) => run.workflow_id === workflow_id && run.status === status) },
  });
  return {
    github: {
      rest: { actions: {
        disableWorkflow: async ({ workflow_id }) => {
          disableCalls.push(workflow_id);
          if (workflow_id === "staging-hyperdrive.yml" || workflow_id === "staging-web.yml") {
            throw Object.assign(new Error("Validation Failed"), {
              status: 422,
              response: { data: { errors: [{ message: "A workflow_call workflow cannot be disabled." }] } },
            });
          }
          disabled.add(workflow_id);
        },
        getWorkflow: async ({ workflow_id }) => ({
          data: { state: disabled.has(workflow_id) ? "disabled_manually" : "active" },
        }),
        listWorkflowRuns,
        getWorkflowRun: async ({ run_id }) => {
          const run = runs.find((candidate) => candidate.id === run_id);
          if (queuedBecomesInProgress && run.status === "queued") run.status = "in_progress";
          return { data: { ...run } };
        },
        cancelWorkflowRun: async ({ run_id }) => {
          const run = runs.find((candidate) => candidate.id === run_id);
          if (run.status === "in_progress") throw Object.assign(new Error("Run has started."), { status: 409 });
          cancelled.push(run_id);
          run.status = "completed";
        },
      } },
    },
    disabled,
    cancelled,
    disableCalls,
    pause: async () => {
      if (completeInProgressOnPause) {
        for (const run of runs) if (run.status === "in_progress" || run.status === "pending") run.status = "completed";
      }
    },
  };
}

test("freezes all release paths, tolerates reusable workflow_call restrictions, and never cancels started work", async () => {
  const fixture = githubFor([
    { id: 1, workflow_id: "staging-release.yml", status: "queued" },
    { id: 2, workflow_id: "staging-hyperdrive.yml", status: "in_progress" },
    { id: 3, workflow_id: "staging-web.yml", status: "pending" },
  ]);

  await freezeStagingReleaseEntryPoints({
    github: fixture.github, owner: "owner", repo: "repo", pause: fixture.pause,
  });

  assert.deepEqual(fixture.disableCalls, STAGING_RELEASE_WORKFLOWS);
  assert.deepEqual([...fixture.disabled], ["staging-release.yml"]);
  assert.deepEqual(fixture.cancelled, [1]);
});

test("does not cancel a run that starts while it is being checked", async () => {
  const fixture = githubFor([
    { id: 1, workflow_id: "staging-release.yml", status: "queued" },
  ], { queuedBecomesInProgress: true });

  await freezeStagingReleaseEntryPoints({
    github: fixture.github, owner: "owner", repo: "repo", pause: fixture.pause,
  });

  assert.deepEqual(fixture.cancelled, []);
});

test("times out closed while preserving in-progress work for operator recovery", async () => {
  const fixture = githubFor([
    { id: 1, workflow_id: "staging-release.yml", status: "in_progress" },
  ], { completeInProgressOnPause: false });

  await assert.rejects(
    freezeStagingReleaseEntryPoints({
      github: fixture.github, owner: "owner", repo: "repo", maxAttempts: 2, pause: fixture.pause,
    }),
    /remain frozen; an operator must recover them/,
  );
  assert.deepEqual(fixture.cancelled, []);
  assert.deepEqual([...fixture.disabled], ["staging-release.yml"]);
});

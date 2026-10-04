import assert from "node:assert/strict";
import test from "node:test";
import { freezeStagingReleaseEntryPoints, STAGING_RELEASE_WORKFLOWS } from "./freeze-staging-release-entry-points.mjs";

function githubFor(runs, { completeAllOnPause = true } = {}) {
  const disabled = new Set();
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
      } },
    },
    disabled,
    disableCalls,
    pause: async () => {
      if (completeAllOnPause) {
        for (const run of runs) run.status = "completed";
      }
    },
  };
}

test("freezes release paths and waits for queued and started work without cancellation", async () => {
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
});

test("times out closed while preserving pending work for operator recovery", async () => {
  const fixture = githubFor([
    { id: 1, workflow_id: "staging-release.yml", status: "queued" },
    { id: 2, workflow_id: "staging-web.yml", status: "in_progress" },
  ], { completeAllOnPause: false });

  await assert.rejects(
    freezeStagingReleaseEntryPoints({
      github: fixture.github, owner: "owner", repo: "repo", maxAttempts: 2, pause: fixture.pause,
    }),
    /remain frozen; an operator must recover them/,
  );
  assert.deepEqual([...fixture.disabled], ["staging-release.yml"]);
});

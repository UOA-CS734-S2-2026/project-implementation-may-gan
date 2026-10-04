export const STAGING_RELEASE_WORKFLOWS = [
  "staging-release.yml",
  "staging-hyperdrive.yml",
  "staging-web.yml",
];

const ACTIVE_STATUSES = ["queued", "waiting", "requested", "pending", "in_progress"];
const REUSABLE_WORKFLOWS = new Set(["staging-hyperdrive.yml", "staging-web.yml"]);

function isWorkflowCallDisableRestriction(error) {
  const detail = JSON.stringify(error?.response?.data?.errors ?? "");
  return error?.status === 422 && /workflow[_ ]call|reusable workflow/i.test(`${error.message ?? ""} ${detail}`);
}

async function activeWorkflowRuns({ github, owner, repo, workflows }) {
  const runs = new Map();
  for (const workflow_id of workflows) {
    for (const status of ACTIVE_STATUSES) {
      for (let page = 1; ; page++) {
        const { data } = await github.rest.actions.listWorkflowRuns({
          owner, repo, workflow_id, status, per_page: 100, page,
        });
        for (const run of data.workflow_runs) runs.set(run.id, run);
        if (data.workflow_runs.length < 100) break;
      }
    }
  }
  return [...runs.values()];
}

/**
 * Freeze new staging releases and let all pending and started work finish.
 * Never cancel a queued run: it could start between inspection and cancellation.
 */
export async function freezeStagingReleaseEntryPoints({
  github,
  owner,
  repo,
  workflows = STAGING_RELEASE_WORKFLOWS,
  maxAttempts = 30,
  pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const reusableWorkflowCallRestrictions = new Set();
  for (const workflow_id of workflows) {
    try {
      await github.rest.actions.disableWorkflow({ owner, repo, workflow_id });
    } catch (error) {
      // GitHub rejects disabling a reusable workflow with workflow_call. Those
      // files have no independent trigger; disabling the caller above freezes
      // future calls, while currently running calls are drained below.
      if (!REUSABLE_WORKFLOWS.has(workflow_id) || !isWorkflowCallDisableRestriction(error)) throw error;
      reusableWorkflowCallRestrictions.add(workflow_id);
    }
  }

  for (const workflow_id of workflows) {
    const { data } = await github.rest.actions.getWorkflow({ owner, repo, workflow_id });
    if (data.state !== "disabled_manually" && !reusableWorkflowCallRestrictions.has(workflow_id)) {
      throw new Error(`Staging deployment workflow ${workflow_id} was not disabled.`);
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const active = await activeWorkflowRuns({ github, owner, repo, workflows });
    if (active.length === 0) return;
    await pause(2_000);
  }

  throw new Error("Staging release activity did not quiesce before activation. Deployment workflows remain frozen; an operator must recover them before another release or activation.");
}

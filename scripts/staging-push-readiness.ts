import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  FcmOAuthError,
  normalizeFcmServiceAccount,
  requestFcmOAuthToken,
} from "../apps/api/src/infrastructure/push/fcm.ts";

type ReadinessCheck =
  | "credentials_missing"
  | "candidate_commit_invalid"
  | "service_account_json_invalid"
  | "service_account_shape_invalid"
  | "service_account_signing_invalid"
  | "oauth_response_rejected"
  | "oauth_response_invalid"
  | "oauth_transport_failed"
  | "oauth_token_acquired";

export interface PushReadinessArtifact {
  candidateCommitSha: string | null;
  timestamp: string;
  pass: boolean;
  outcome: "passed" | "skipped" | "failed";
  checks: ReadinessCheck[];
}

export interface PushReadinessResult {
  exitCode: 0 | 1;
  artifact: PushReadinessArtifact;
}

export async function runStagingPushReadiness(input: {
  sourceCredentials?: string;
  candidateCommitSha?: string;
  artifactPath: string;
  fetchImpl?: typeof globalThis.fetch;
  now?: () => Date;
  writeArtifact?: (path: string, contents: string) => Promise<void>;
}): Promise<PushReadinessResult> {
  const now = input.now ?? (() => new Date());
  const writeArtifact = input.writeArtifact ?? (async (path, contents) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, "utf8");
  });
  const candidateCommitSha = /^[a-f0-9]{40}$/.test(input.candidateCommitSha ?? "") ? input.candidateCommitSha! : null;
  const artifact: PushReadinessArtifact = {
    candidateCommitSha,
    timestamp: now().toISOString(),
    pass: false,
    outcome: "failed",
    checks: [],
  };
  const finish = async (exitCode: 0 | 1): Promise<PushReadinessResult> => {
    await writeArtifact(input.artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    return { exitCode, artifact };
  };

  if (!candidateCommitSha) {
    artifact.checks.push("candidate_commit_invalid");
    return finish(1);
  }
  if (input.sourceCredentials === undefined || input.sourceCredentials === "") {
    artifact.pass = true;
    artifact.outcome = "skipped";
    artifact.checks.push("credentials_missing");
    return finish(0);
  }

  let document: unknown;
  try {
    document = JSON.parse(input.sourceCredentials);
  } catch {
    artifact.checks.push("service_account_json_invalid");
    return finish(1);
  }
  const serviceAccount = normalizeFcmServiceAccount(document);
  if (!serviceAccount) {
    artifact.checks.push("service_account_shape_invalid");
    return finish(1);
  }

  try {
    await requestFcmOAuthToken({ serviceAccount, fetch: input.fetchImpl, now });
    artifact.pass = true;
    artifact.outcome = "passed";
    artifact.checks.push("oauth_token_acquired");
    return finish(0);
  } catch (error) {
    if (error instanceof FcmOAuthError) {
      const category: Record<FcmOAuthError["category"], ReadinessCheck> = {
        signing_invalid: "service_account_signing_invalid",
        response_rejected: "oauth_response_rejected",
        response_invalid: "oauth_response_invalid",
        transport_failed: "oauth_transport_failed",
      };
      artifact.checks.push(category[error.category]);
    } else {
      artifact.checks.push("oauth_transport_failed");
    }
    return finish(1);
  }
}

async function main() {
  const result = await runStagingPushReadiness({
    sourceCredentials: process.env.FCM_SERVICE_ACCOUNT_JSON,
    candidateCommitSha: process.env.CANDIDATE_COMMIT_SHA,
    artifactPath: process.env.PUSH_READINESS_ARTIFACT_PATH ?? "push-readiness.json",
  });
  process.exitCode = result.exitCode;
}

if (import.meta.main) void main();

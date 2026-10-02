export const accountCapabilities = [
  "ordinary",
  "restricted_cleanup",
  "policy_read",
  "lifecycle_status",
  "cancel_deletion_verification",
  "request_deletion",
  "export",
  "appeal",
  "signout",
] as const;

export type AccountCapability = (typeof accountCapabilities)[number];
export type AccountRestriction =
  | "active"
  | "banned"
  | "pending_deletion"
  | "purging"
  | "purge_failed"
  | "underage_restricted"
  | "terms_blocked"
  | "age_declaration_blocked";

/** Minimal, content-free input to the server-owned account policy. */
export interface AccountPolicyState {
  lifecycleState: "active" | "pending_deletion" | "purging" | "purge_failed";
  banned: boolean;
  temporarilyRestricted: boolean;
  termsRequired: boolean;
  termsAccepted: boolean;
  ageDeclarationRequired: boolean;
  ageDeclared: boolean;
}

export interface AccountPolicy {
  restriction: AccountRestriction;
  allowed: ReadonlySet<AccountCapability>;
}

const active = new Set<AccountCapability>(accountCapabilities);
const restricted = new Set<AccountCapability>(["restricted_cleanup", "policy_read", "lifecycle_status", "appeal", "signout"]);
const terminal = new Set<AccountCapability>(["policy_read", "signout"]);
const actionable = new Set<AccountCapability>(["ordinary", "restricted_cleanup", "policy_read", "signout"]);
const pendingDeletion = new Set<AccountCapability>([
  "restricted_cleanup",
  "policy_read",
  "lifecycle_status",
  "cancel_deletion_verification",
  "export",
  "signout",
]);
const management = new Set<AccountCapability>([
  "restricted_cleanup",
  "policy_read",
  "lifecycle_status",
  "request_deletion",
  "export",
  "appeal",
  "signout",
]);

/**
 * Policy precedence is deterministic. A ban is never weakened by lifecycle or
 * legal state. Purging and failed purge override other non-ban restrictions,
 * then a reviewed underage restriction overrides pending deletion and legal
 * gates. Missing lifecycle rows are the additive active default.
 */
export function resolveAccountPolicy(state: Partial<AccountPolicyState> | undefined): AccountPolicy {
  const normalized: AccountPolicyState = {
    lifecycleState: state?.lifecycleState ?? "active",
    banned: state?.banned === true,
    temporarilyRestricted: state?.temporarilyRestricted === true,
    termsRequired: state?.termsRequired === true,
    termsAccepted: state?.termsAccepted === true,
    ageDeclarationRequired: state?.ageDeclarationRequired === true,
    ageDeclared: state?.ageDeclared === true,
  };

  if (normalized.banned) return { restriction: "banned", allowed: restricted };
  if (normalized.lifecycleState === "purging") return { restriction: "purging", allowed: terminal };
  if (normalized.lifecycleState === "purge_failed") return { restriction: "purge_failed", allowed: terminal };
  if (normalized.temporarilyRestricted) return { restriction: "underage_restricted", allowed: management };
  if (normalized.lifecycleState === "pending_deletion") return { restriction: "pending_deletion", allowed: pendingDeletion };
  if (normalized.termsRequired && !normalized.termsAccepted) return { restriction: "terms_blocked", allowed: management };
  if (normalized.ageDeclarationRequired && !normalized.ageDeclared) return { restriction: "age_declaration_blocked", allowed: management };
  return { restriction: "active", allowed: active };
}

export function allowsAccountCapability(policy: AccountPolicy, capability: AccountCapability): boolean {
  return policy.allowed.has(capability);
}

/** Only labels backed by a currently registered account action reach clients. */
export function actionableAccountCapabilities(policy: AccountPolicy): AccountCapability[] {
  return [...policy.allowed].filter((capability) => actionable.has(capability)).sort();
}

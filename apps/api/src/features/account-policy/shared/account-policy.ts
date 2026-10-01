export const accountCapabilities = [
  "ordinary",
  "policy_read",
  "lifecycle_status",
  "cancel_deletion_verification",
  "request_deletion",
  "export",
  "appeal",
  "signout",
] as const;

export type AccountCapability = (typeof accountCapabilities)[number];
export type AccountRestriction = "active" | "pending_deletion" | "purging" | "purge_failed" | "underage_restricted" | "terms_blocked" | "age_declaration_blocked";

/** Minimal, content-free account state returned by the database policy reader. */
export interface AccountPolicyState {
  lifecycleState: "active" | "pending_deletion" | "purging" | "purge_failed";
  termsRequired: boolean;
  termsAccepted: boolean;
  ageDeclarationRequired: boolean;
  ageDeclared: boolean;
  temporarilyRestricted: boolean;
}

export interface AccountPolicy {
  restriction: AccountRestriction;
  allowed: ReadonlySet<AccountCapability>;
}

const active = new Set<AccountCapability>(accountCapabilities);
const management = new Set<AccountCapability>(["policy_read", "lifecycle_status", "request_deletion", "export", "appeal", "signout"]);
const pendingDeletion = new Set<AccountCapability>(["policy_read", "lifecycle_status", "cancel_deletion_verification", "export", "signout"]);
const purging = new Set<AccountCapability>(["policy_read", "lifecycle_status", "appeal", "signout"]);

/**
 * Policy precedence is deliberately deterministic. A present lifecycle row is
 * authoritative, and missing rows are equivalent to the additive active default.
 * Legal and age gates activate only after effective server records exist.
 */
export function resolveAccountPolicy(state: Partial<AccountPolicyState> | undefined): AccountPolicy {
  const normalized: AccountPolicyState = {
    lifecycleState: state?.lifecycleState ?? "active",
    termsRequired: state?.termsRequired === true,
    termsAccepted: state?.termsAccepted === true,
    ageDeclarationRequired: state?.ageDeclarationRequired === true,
    ageDeclared: state?.ageDeclared === true,
    temporarilyRestricted: state?.temporarilyRestricted === true,
  };
  if (normalized.lifecycleState === "purging") return { restriction: "purging", allowed: purging };
  if (normalized.lifecycleState === "purge_failed") return { restriction: "purge_failed", allowed: purging };
  if (normalized.temporarilyRestricted) return { restriction: "underage_restricted", allowed: management };
  if (normalized.lifecycleState === "pending_deletion") return { restriction: "pending_deletion", allowed: pendingDeletion };
  if (normalized.termsRequired && !normalized.termsAccepted) return { restriction: "terms_blocked", allowed: management };
  if (normalized.ageDeclarationRequired && !normalized.ageDeclared) return { restriction: "age_declaration_blocked", allowed: management };
  return { restriction: "active", allowed: active };
}

export function allowsAccountCapability(policy: AccountPolicy, capability: AccountCapability): boolean {
  return policy.allowed.has(capability);
}

/** Grants are useful only for the lifecycle transition currently permitted. */
export function allowsManagementGrantAction(restriction: AccountRestriction, action: "request_deletion" | "cancel_deletion"): boolean {
  if (action === "cancel_deletion") return restriction === "pending_deletion";
  return ["active", "terms_blocked", "age_declaration_blocked", "underage_restricted"].includes(restriction);
}

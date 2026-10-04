import { OWNED_MEDIA_OBJECT_NAMESPACE } from "@dayli/contracts";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../schema/index";

/** Every current column is listed explicitly. Unknown fields fail the inventory gate. */
export const inventoryTestRegistry = {
  authSecretsExcluded: { file: "packages/db/src/export/inventory.test.ts", name: "keeps authentication and push secrets out of the inventory" },
  recipientDataExcluded: { file: "packages/db/src/export/inventory.test.ts", name: "keeps recipient and relationship data out of the inventory" },
  lifecycleOperationsExcluded: { file: "packages/db/src/export/inventory.test.ts", name: "keeps lifecycle and operational fields out of the inventory" },
  unprovenMediaExcluded: { file: "packages/db/src/export/inventory.test.ts", name: "keeps unproven media and provider URLs out of the inventory" },
  catalogExcluded: { file: "packages/db/src/export/inventory.test.ts", name: "keeps catalog and temporary reservation data out of the inventory" },
  profileIncluded: { file: "packages/db/src/export/inventory.test.ts", name: "records approved profile and legal evidence fields" },
  postsIncluded: { file: "packages/db/src/export/inventory.test.ts", name: "records approved journals notes and Trash fields" },
  messagesIncluded: { file: "packages/db/src/export/inventory.test.ts", name: "records authored readable messages without reply previews" },
  ownedMediaIncluded: { file: "packages/db/src/export/inventory.test.ts", name: "records media metadata while withholding raw object keys" },
  commentsIncluded: { file: "packages/db/src/export/inventory.test.ts", name: "records authored comments without reply pointers or moderators" },
  jsonValidFixture: { file: "packages/db/src/export/inventory.integration.test.ts", name: "accepts valid fixtures for every transformed JSON family" },
  jsonUnknownKeyFixture: { file: "packages/db/src/export/inventory.integration.test.ts", name: "rejects extra keys for every transformed JSON family" },
} as const;

type InventoryTestId = keyof typeof inventoryTestRegistry;

interface ExportTableDecision {
  owner: string;
  retention: string;
  deletion: string;
  access: string;
  retainedForOthers: string;
  trashRestore: string;
  tests: readonly InventoryTestId[];
  /** Fields in one reviewed owner-scoped projection, never SELECT *. */
  included: readonly string[];
  /** Fields not exported, including fields from entirely excluded tables. */
  excluded: readonly string[];
  /** Fields exported through a separately reviewed conversion, not raw JSON. */
  transformed?: Readonly<Record<string, readonly string[]>>;
}

const fields = (value: string) => value.split(",");
const excludedRetention: Readonly<Record<string, string>> = {
  authentication_credentials: "until_account_removal_or_credential_rotation",
  temporary_authentication_proof: "until_proof_expiry_or_account_removal",
  private_lifecycle_control_state: "until_account_cleanup",
  action_bound_credentials: "until_short_grant_expiry_or_consumption",
  "30_days_after_cleanup": "30_days_after_cleanup",
  recipient_safe_change_feed: "until_last_participant_permanent_deletion",
  recipient_safe_history: "until_last_participant_permanent_deletion",
  published_prompt_catalog: "published_catalog_retention",
  private_cleanup_metadata: "until_object_cleanup_then_30_day_incident_evidence",
  private_export_operations: "until_account_cleanup_archive_expires_after_24_hours",
  relationship_privacy_deferred: "until_related_account_cleanup",
  unverified_legacy_object_provenance: "while_parent_post_exists",
  published_documents_elsewhere: "published_legal_catalog_retention",
  other_participant_identity_and_reactions_deferred: "until_last_participant_permanent_deletion",
  private_delivery_operations: "until_delivery_or_operational_retention_end",
  recipient_safe_identity_projection: "until_last_participant_permanent_deletion",
  private_incident_record: "unresolved_then_30_days_after_resolution",
  submission_integrity_state: "until_parent_post_cleanup",
  push_credentials_and_device_state: "until_signout_invalidation_or_account_cleanup",
  abuse_protection_state: "through_rate_limit_window_up_to_30_days_for_logs",
  unconsumed_registration_proof: "until_intent_expiry_or_consumption",
  authentication_session_state: "until_session_expiry_signout_or_account_cleanup",
  temporary_realtime_credential: "until_ticket_expiry_or_consumption",
  temporary_username_claim: "until_reservation_expiry_or_account_cleanup",
  one_time_authentication_proof: "until_verification_expiry_or_consumption",
  note_submission_integrity_state: "until_parent_note_removal",
};
const excludedDeletion: Readonly<Record<string, string>> = {
  authentication_credentials: "purge_with_account_or_credential_rotation",
  temporary_authentication_proof: "expire_or_purge_with_account",
  private_lifecycle_control_state: "purge_after_account_cleanup",
  action_bound_credentials: "expire_or_consume_then_purge_with_account",
  "30_days_after_cleanup": "delete_30_days_after_cleanup",
  recipient_safe_change_feed: "remove_when_last_participant_permanently_deleted",
  recipient_safe_history: "remove_when_last_participant_permanently_deleted",
  published_prompt_catalog: "retain_as_nonpersonal_catalog",
  private_cleanup_metadata: "delete_after_object_cleanup_and_incident_expiry",
  private_export_operations: "expire_archive_after_24_hours_and_purge_with_account",
  relationship_privacy_deferred: "remove_when_either_account_permanently_deleted",
  unverified_legacy_object_provenance: "purge_with_parent_post_after_manual_media_review",
  published_documents_elsewhere: "retain_published_catalog",
  other_participant_identity_and_reactions_deferred: "retain_for_survivors_until_last_participant_deleted",
  private_delivery_operations: "remove_after_delivery_or_account_cleanup",
  recipient_safe_identity_projection: "detach_deleted_account_keep_until_last_participant_deleted",
  private_incident_record: "delete_30_days_after_resolution",
  submission_integrity_state: "purge_with_parent_post",
  push_credentials_and_device_state: "revoke_on_signout_purge_with_account",
  abuse_protection_state: "expire_after_rate_limit_window",
  unconsumed_registration_proof: "expire_or_consume",
  authentication_session_state: "revoke_or_expire_then_purge_with_account",
  temporary_realtime_credential: "expire_or_consume",
  temporary_username_claim: "expire_or_purge_with_account",
  one_time_authentication_proof: "expire_or_consume",
  note_submission_integrity_state: "purge_with_note_before_account",
};
const exclusionTestByReason: Readonly<Record<string, InventoryTestId>> = {
  authentication_credentials: "authSecretsExcluded",
  temporary_authentication_proof: "authSecretsExcluded",
  private_lifecycle_control_state: "lifecycleOperationsExcluded",
  action_bound_credentials: "authSecretsExcluded",
  "30_days_after_cleanup": "lifecycleOperationsExcluded",
  recipient_safe_change_feed: "recipientDataExcluded",
  recipient_safe_history: "recipientDataExcluded",
  published_prompt_catalog: "catalogExcluded",
  private_cleanup_metadata: "lifecycleOperationsExcluded",
  private_export_operations: "lifecycleOperationsExcluded",
  relationship_privacy_deferred: "recipientDataExcluded",
  unverified_legacy_object_provenance: "unprovenMediaExcluded",
  published_documents_elsewhere: "catalogExcluded",
  other_participant_identity_and_reactions_deferred: "recipientDataExcluded",
  private_delivery_operations: "recipientDataExcluded",
  recipient_safe_identity_projection: "recipientDataExcluded",
  private_incident_record: "lifecycleOperationsExcluded",
  submission_integrity_state: "lifecycleOperationsExcluded",
  push_credentials_and_device_state: "authSecretsExcluded",
  abuse_protection_state: "lifecycleOperationsExcluded",
  unconsumed_registration_proof: "authSecretsExcluded",
  authentication_session_state: "authSecretsExcluded",
  temporary_realtime_credential: "authSecretsExcluded",
  temporary_username_claim: "catalogExcluded",
  one_time_authentication_proof: "authSecretsExcluded",
  note_submission_integrity_state: "lifecycleOperationsExcluded",
};
const excluded = (columns: string, owner: string, reason: string): ExportTableDecision => {
  const retention = excludedRetention[reason];
  const deletion = excludedDeletion[reason];
  const test = exclusionTestByReason[reason];
  if (!retention || !deletion || !test) throw new Error(`An excluded export source needs lifecycle rules and a canary: ${reason}`);
  return {
    owner,
    retention,
    deletion,
    access: `excluded_${reason}`,
    retainedForOthers: "not_applicable",
    trashRestore: "not_applicable",
    tests: [test],
    included: [],
    excluded: fields(columns),
  };
};
const owned = (input: Omit<ExportTableDecision, "tests">, sourceTest: InventoryTestId): ExportTableDecision => {
  const exclusions: Record<string, InventoryTestId> = {
    profileIncluded: "authSecretsExcluded", postsIncluded: "lifecycleOperationsExcluded",
    messagesIncluded: "recipientDataExcluded", ownedMediaIncluded: "unprovenMediaExcluded",
    commentsIncluded: "recipientDataExcluded",
  };
  return { ...input, tests: input.excluded.length > 0
    ? [sourceTest, exclusions[sourceTest] ?? "lifecycleOperationsExcluded"] : [sourceTest] };
};

export const exportDataInventory: Readonly<Record<string, ExportTableDecision>> = {
  account: excluded("id,account_id,provider_id,user_id,access_token,refresh_token,id_token,access_token_expires_at,refresh_token_expires_at,scope,password,created_at,updated_at", "user_id", "authentication_credentials"),
  account_google_reauthentication_intents: excluded("state_digest,nonce_digest,user_id,session_id,action,lifecycle_generation,expires_at,claimed_at,created_at", "user_id", "temporary_authentication_proof"),
  account_lifecycles: excluded("user_id,state,request_id,idempotency_key_digest,generation,requested_at,cancel_until,purge_due_at,purge_started_at,last_error_category,next_attempt_at,lease_token,lease_expires_at,created_at,updated_at", "user_id", "private_lifecycle_control_state"),
  account_management_grants: excluded("token_digest,user_id,session_id,action,lifecycle_generation,credential_hash_digest,google_subject_digest,expires_at,consumed_at,created_at", "user_id", "action_bound_credentials"),
  account_notification_preferences: owned({
    owner: "user_id", retention: "account_lifetime", deletion: "purge_with_account", access: "owner_preference_procedure",
    retainedForOthers: "not_applicable", trashRestore: "not_applicable",
    included: fields("user_id,enabled,created_at,updated_at"), excluded: [],
  }, "profileIncluded"),
  account_purge_receipts: { ...excluded("request_id,subject_digest,requested_at,completed_at,expires_at,outcome,completed_stage_count", "request_id_and_subject_digest", "30_days_after_cleanup"), deletion: "delete_30_days_after_cleanup" },
  age_declarations: owned({
    owner: "user_id", retention: "account_lifetime", deletion: "purge_with_account", access: "owner_procedure",
    retainedForOthers: "not_applicable", trashRestore: "not_applicable",
    included: fields("user_id,declaration_version,declared_at"), excluded: [],
  }, "profileIncluded"),
  conversation_changes: { ...excluded("conversation_id,change_sequence,kind,message_id,member_id,member_participant_id,created_at", "conversation_membership", "recipient_safe_change_feed"), retainedForOthers: "surviving_recipient_change_feed" },
  conversation_members: { ...excluded("conversation_id,user_id,participant_id,last_read_sequence,receipt_sequence,created_at,updated_at", "user_id_and_conversation", "recipient_safe_history"), retainedForOthers: "surviving_participant_history" },
  conversations: { ...excluded("id,kind,user_low_id,user_high_id,initiator_id,participant_low_id,participant_high_id,initiator_participant_id,request_state,last_message_sequence,last_change_sequence,last_activity_at,created_at,updated_at", "participants", "recipient_safe_history"), retainedForOthers: "until_last_participant_deleted" },
  daily_prompts: excluded("id,month_day,text,version,effective_date,source,source_commit", "service_catalog", "published_prompt_catalog"),
  data_export_cleanup_incidents: excluded("id,failure_category,failure_count,first_failed_at,last_failed_at,resolved_at,expires_at", "digest_of_cleanup_task", "private_incident_record"),
  data_export_object_cleanup_tasks: excluded("id,archive_object_key,upload_id,upload_started_at,verified_absent_at,status,attempt_count,next_attempt_at,lease_token,lease_expires_at,failure_category,created_at,updated_at", "request_id_via_archive", "private_cleanup_metadata"),
  data_export_requests: excluded("id,user_id,lifecycle_generation,status,requested_at,snapshot_cutoff_at,archive_object_key,ready_at,expires_at,archive_cleanup_task_id,lease_token,lease_expires_at,failure_category,created_at,updated_at", "user_id", "private_export_operations"),
  friend_requests: { ...excluded("id,sender_id,recipient_id,status,created_at,resolved_at", "sender_and_recipient", "relationship_privacy_deferred"), retention: "while_both_accounts_exist_for_throttling", deletion: "remove_when_either_account_permanently_deleted", retainedForOthers: "not_retained_after_either_account_deleted" },
  friendships: { ...excluded("user_id,friend_id,state,state_changed_at", "user_id_and_friend_id", "relationship_privacy_deferred"), retention: "while_both_accounts_exist", deletion: "remove_when_either_account_permanently_deleted", retainedForOthers: "not_retained_after_either_account_deleted" },
  future_self_note_deliveries: excluded("id,note_id,schedule_version,deliver_on,status,lease_token,lease_expires_at,attempts,claimed_at,delivered_at", "note_id_to_owner_id", "private_delivery_operations"),
  future_self_note_idempotency_keys: excluded("owner_id,idempotency_key,request_fingerprint,note_id,created_at", "owner_id", "note_submission_integrity_state"),
  // The body stays out until an export owner decides how an undelivered note may be exported;
  // the API never returns it to anyone before its Auckland delivery date.
  future_self_notes: owned({
    owner: "owner_id", retention: "while_owned", deletion: "purge_with_account",
    access: "owner_scoped_note_procedure", retainedForOthers: "not_applicable", trashRestore: "not_applicable",
    included: fields("id,owner_id,deliver_on,status,delivered_at,created_at,updated_at"),
    excluded: fields("body,schedule_version"),
  }, "postsIncluded"),
  legacy_cloudinary_media: excluded("media_id,cloudinary_public_id,cloudinary_url,legacy_type", "post_media_to_post", "unverified_legacy_object_provenance"),
  legal_document_versions: excluded("id,kind,version,content_digest,status,material_change,notice_starts_at,effective_at,urgent_change_reason,created_at", "public_policy_catalog", "published_documents_elsewhere"),
  media_reservation: owned({
    owner: "owner_id_and_post_or_avatar_link", retention: "while_owned_or_restorable", deletion: "reference_checked_cleanup",
    access: "owner_scoped_file_procedure", retainedForOthers: "not_applicable", trashRestore: "include_only_while_restorable",
    included: fields("content_type,byte_size"),
    excluded: fields("id,owner_id,object_key,status,failure_reason,validated_at,created_at,expires_at,cleanup_claimed_at,cleanup_lease_token,cleanup_lease_expires_at,cleanup_attempts,cleanup_available_at"),
  }, "ownedMediaIncluded"),
  message_reactions: { ...excluded("message_id,user_id,participant_id,reaction,created_at", "participant_id", "other_participant_identity_and_reactions_deferred"), retainedForOthers: "surviving_recipient_reactions" },
  messages: owned({
    owner: "sender_participant_id_and_current_readable_history", retention: "recipient_safe_history",
    deletion: "retain_for_surviving_recipients", access: "author_and_readable_history_procedure",
    retainedForOthers: "retain_for_surviving_recipients", trashRestore: "not_applicable",
    included: fields("id,conversation_id,sequence,body,version,created_at,edited_at,unsent_at"),
    excluded: fields("sender_id,sender_participant_id,client_message_id,request_fingerprint,reply_to_message_id"),
  }, "messagesIncluded"),
  messaging_outbox: excluded("id,event_id,recipient_id,conversation_id,change_sequence,channel,device_registration_id,status,attempts,available_at,lease_token,lease_expires_at,failure_category,created_at,delivered_at", "recipient_id", "private_delivery_operations"),
  messaging_participants: { ...excluded("id,user_id,state,created_at", "user_id_or_deleted_account", "recipient_safe_identity_projection"), retainedForOthers: "deleted_account_label" },
  notification_deliveries: excluded("id,event_id,recipient_id,device_registration_id,status,attempts,available_at,lease_token,lease_expires_at,failure_category,created_at,delivered_at", "recipient_id", "private_delivery_operations"),
  notification_events: excluded("id,kind,recipient_id,deduplication_key,source_type,source_id,target_type,target_id,expires_at,created_at", "recipient_id", "private_delivery_operations"),
  operator_cases: excluded("id,subject_user_id,type,status,decision,reason_category,operator_reference,review_due_at,reviewed_at,resolved_at,created_at,updated_at", "subject_user_id", "private_incident_record"),
  post_comments: owned({
    owner: "author_id_and_current_readable_post", retention: "while_parent_post_exists",
    deletion: "purge_with_post", access: "author_and_readable_post_procedure",
    retainedForOthers: "shown_to_post_readers_until_deleted_or_post_purged", trashRestore: "include_only_while_restorable",
    included: fields("id,post_id,body,created_at,edited_at,deleted_at"),
    excluded: fields("author_id,parent_comment_id,client_comment_id,deleted_by"),
  }, "commentsIncluded"),
  post_idempotency_keys: excluded("author_id,idempotency_key,request_fingerprint,post_id,created_at", "author_id", "submission_integrity_state"),
  post_likes: { ...excluded("post_id,user_id,created_at", "user_id_and_post_id", "other_participant_identity_and_reactions_deferred"), retention: "while_parent_post_exists", deletion: "remove_on_unlike_or_purge_with_post", retainedForOthers: "shown_to_post_readers_until_unliked_or_post_purged" },
  post_media: owned({
    owner: "post_id_to_author_id", retention: "while_owned_or_restorable", deletion: "reference_checked_cleanup",
    access: "owner_scoped_file_procedure", retainedForOthers: "not_applicable", trashRestore: "include_only_while_restorable",
    included: fields("id,post_id,attachment_order,accepted_at,detached_at"), excluded: fields("reservation_id"),
  }, "ownedMediaIncluded"),
  post_revisions: owned({
    owner: "post_id_to_author_id", retention: "while_owned_or_restorable", deletion: "purge_with_post",
    access: "owner_scoped_revision_procedure", retainedForOthers: "not_applicable", trashRestore: "include_only_while_restorable",
    included: fields("id,post_id,revision_number,previous_reflective_answer,previous_caption,previous_rating,previous_audience,previous_prompt_id,created_at"),
    excluded: [],
    transformed: { previous_attachment_refs: ["media_id", "attachment_order", "status"] },
  }, "postsIncluded"),
  posts: owned({
    owner: "author_id", retention: "while_owned_or_restorable", deletion: "purge_with_account_or_post_trash",
    access: "owner_scoped_post_procedure", retainedForOthers: "not_applicable", trashRestore: "include_only_while_restorable",
    included: fields("id,author_id,local_date,prompt_id,reflective_answer,caption,rating,audience,weather_condition,weather_temperature_c,weather_place_name,accepted_at,released_at,trashed_at,restore_until,trash_purge_due_at,created_at,updated_at"),
    excluded: fields("trash_generation,trash_lease_token,trash_lease_expires_at,trash_failure_category,trash_next_attempt_at"),
  }, "postsIncluded"),
  profile_avatars: owned({
    owner: "user_id", retention: "while_profile_avatar_exists", deletion: "reference_checked_cleanup",
    access: "owner_scoped_file_procedure", retainedForOthers: "not_applicable", trashRestore: "not_applicable",
    included: fields("user_id,set_at"), excluded: fields("reservation_id"),
  }, "ownedMediaIncluded"),
  push_devices: excluded("id,user_id,session_id,installation_id,platform,token,token_ciphertext,token_key_version,token_hash,opted_in,notification_schema_version,registered_at,invalidated_at", "user_id", "push_credentials_and_device_state"),
  rateLimit: excluded("id,key,count,last_request", "request_key", "abuse_protection_state"),
  registration_intents: excluded("token_digest,terms_version_id,age_declaration_version,flow_binding_digest,expires_at,consumed_at,created_at", "registration_flow", "unconsumed_registration_proof"),
  relationship_blocks: { ...excluded("blocker_id,blocked_id,blocked_at,unblocked_at", "blocker_id_and_blocked_id", "relationship_privacy_deferred"), retention: "while_both_accounts_exist", deletion: "remove_when_either_account_permanently_deleted", retainedForOthers: "not_retained_after_either_account_deleted" },
  relationship_search_quota: excluded("actor_id,window_started_at,request_count", "actor_id", "abuse_protection_state"),
  session: excluded("id,expires_at,token,created_at,updated_at,ip_address,user_agent,user_id", "user_id", "authentication_session_state"),
  social_link_confirmation: excluded("state_digest,user_id,session_id,expires_at,consumed_at,created_at", "user_id", "temporary_authentication_proof"),
  socket_tickets: excluded("token_hash,user_id,session_id,expires_at,session_expires_at,consumed_at,created_at", "user_id", "temporary_realtime_credential"),
  terms_acceptances: owned({
    owner: "user_id", retention: "account_lifetime", deletion: "purge_with_account", access: "owner_procedure",
    retainedForOthers: "not_applicable", trashRestore: "not_applicable",
    included: fields("user_id,terms_version_id,accepted_at"), excluded: [],
  }, "profileIncluded"),
  tomorrow_notes: owned({
    owner: "author_id_and_post_id", retention: "while_owned_or_restorable", deletion: "purge_with_post",
    access: "owner_scoped_note_procedure", retainedForOthers: "not_applicable", trashRestore: "include_only_while_restorable",
    included: fields("id,post_id,author_id,note,submitted_at,available_on"), excluded: [],
  }, "postsIncluded"),
  user: owned({
    owner: "id", retention: "account_lifetime", deletion: "purge_with_account", access: "owner_profile_procedure",
    retainedForOthers: "not_applicable", trashRestore: "not_applicable",
    included: fields("id,name,username,username_changed_at,display_username,bio,mbti,what_i_do,listening_to,profile_visibility,email,email_verified,created_at,updated_at"),
    excluded: fields("image,tier,role,banned,ban_reason,ban_expires,legal_registration_admission"),
  }, "profileIncluded"),
  username_reservations: excluded("username,user_id,reserved_until,created_at", "user_id", "temporary_username_claim"),
  verification: excluded("id,identifier,value,expires_at,created_at,updated_at", "identifier", "one_time_authentication_proof"),
};

/** Prefixes are explicit. An R2 key never proves ownership by itself. */
export const PRIVATE_EXPORT_OBJECT_NAMESPACE = "private/data-exports/v2/";

export const exportObjectNamespaces = {
  [OWNED_MEDIA_OBJECT_NAMESPACE]: { behavior: "owner_post_or_avatar_reference", export: "bytes_after_scoped_authorization" },
  [PRIVATE_EXPORT_OBJECT_NAMESPACE]: { behavior: "private_archive_cleanup_inventory", export: "never_as_source" },
} as const;


interface ExportJsonFamilyReview {
  keys: readonly string[];
  validator: `public.${string}(jsonb)`;
  positiveFixture: string;
  extraKeyFixture: string;
  positiveTest: InventoryTestId;
  extraKeyTest: InventoryTestId;
}

/** Every transformed JSON family requires SQL enforcement and executable fixtures. */
export const exportJsonKeyFamilies = {
  "post_revisions.previous_attachment_refs": {
    keys: ["media_id", "attachment_order", "status"],
    validator: "public.dayli_attachment_refs_valid(jsonb)",
    positiveFixture: '[{"media_id":"synthetic","attachment_order":0,"status":"attached"}]',
    extraKeyFixture: '[{"media_id":"synthetic","attachment_order":0,"status":"attached","secret":"leak"}]',
    positiveTest: "jsonValidFixture",
    extraKeyTest: "jsonUnknownKeyFixture",
  },
} as const satisfies Readonly<Record<string, ExportJsonFamilyReview>>;

// Compile-time check: a new or removed revision JSON key needs a decision.
type RevisionAttachment = (typeof schema.postRevisions.$inferSelect.previousAttachmentRefs)[number];
type RevisionJsonKey = typeof exportJsonKeyFamilies["post_revisions.previous_attachment_refs"]["keys"][number];
type RevisionKeyDifference = Exclude<keyof RevisionAttachment, RevisionJsonKey>
  | Exclude<RevisionJsonKey, keyof RevisionAttachment>;
const revisionJsonKeysClassified: RevisionKeyDifference extends never ? true : never = true;
void revisionJsonKeysClassified;

/** Introspect the checked-in Drizzle schema as a fast fail-closed preflight. */
export function currentExportSchemaColumns(): Record<string, string[]> {
  const tables: Record<string, string[]> = {};
  for (const table of Object.values(schema)) {
    if (!(table instanceof PgTable)) continue;
    const configured = getTableConfig(table);
    tables[configured.name] = configured.columns.map((column) => column.name).sort();
  }
  return tables;
}

export function currentExportJsonColumns(): string[] {
  const jsonColumns: string[] = [];
  for (const table of Object.values(schema)) {
    if (!(table instanceof PgTable)) continue;
    const configured = getTableConfig(table);
    for (const column of configured.columns) {
      if (column.dataType === "json") jsonColumns.push(`${configured.name}.${column.name}`);
    }
  }
  return jsonColumns.sort();
}

function fixtureRecord(fixture: string): Readonly<Record<string, unknown>> | null {
  try {
    const parsed: unknown = JSON.parse(fixture);
    const record: unknown = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
    return record !== null && typeof record === "object" && !Array.isArray(record)
      ? record as Readonly<Record<string, unknown>> : null;
  } catch {
    return null;
  }
}

/** A JSON column needs an explicit key-family decision even if excluded. */
export function validateExportJsonFamilies(
  actual: readonly string[],
  families: Readonly<Record<string, ExportJsonFamilyReview>> = exportJsonKeyFamilies,
  decisions: Readonly<Record<string, ExportTableDecision>> = exportDataInventory,
): string[] {
  const errors: string[] = [];
  const reviewed = Object.keys(families).sort();
  if (JSON.stringify([...actual].sort()) !== JSON.stringify(reviewed)) {
    errors.push(`Unclassified or stale JSON key family: expected ${reviewed.join(",")}; found ${[...actual].sort().join(",")}`);
  }
  for (const [table, decision] of Object.entries(decisions)) {
    for (const [column, keys] of Object.entries(decision.transformed ?? {})) {
      const family = `${table}.${column}`;
      if (JSON.stringify(families[family]?.keys) !== JSON.stringify(keys)) {
        errors.push(`Missing or stale transformed JSON key decision: ${family}`);
      }
    }
  }
  for (const [name, review] of Object.entries(families)) {
    const positive = fixtureRecord(review.positiveFixture);
    const extra = fixtureRecord(review.extraKeyFixture);
    const extraKeys = extra && positive
      ? Object.keys(extra).filter((key) => !(key in positive)) : [];
    const reviewedValues = positive && extra
      ? Object.keys(positive).every((key) => JSON.stringify(positive[key]) === JSON.stringify(extra[key])) : false;
    if (!/^public\.[a-z_][a-z_0-9]*\(jsonb\)$/.test(review.validator ?? "")
      || !positive || !extra || !reviewedValues || extraKeys.length !== 1
      || JSON.stringify(Object.keys(positive).sort()) !== JSON.stringify([...review.keys].sort())
      || review.positiveTest !== "jsonValidFixture" || review.extraKeyTest !== "jsonUnknownKeyFixture") {
      errors.push(`JSON family needs a SQL validator and valid plus extra-key fixtures: ${name}`);
    }
  }
  return errors;
}

export function validateExportInventory(
  actual: Readonly<Record<string, readonly string[]>>,
  decisions: Readonly<Record<string, ExportTableDecision>> = exportDataInventory,
): string[] {
  const errors: string[] = [];
  for (const [table, columns] of Object.entries(actual)) {
    const decision = decisions[table];
    if (!decision) { errors.push(`Unclassified table: ${table}`); continue; }
    const classified = [...decision.included, ...decision.excluded, ...Object.keys(decision.transformed ?? {})].sort();
    const unique = new Set(classified);
    if (unique.size !== classified.length) errors.push(`Duplicate column decision: ${table}`);
    if (JSON.stringify(classified) !== JSON.stringify([...columns].sort())) {
      errors.push(`Unclassified or stale columns: ${table}`);
    }
    if (decision.tests.length === 0 || !decision.access || !decision.retainedForOthers || !decision.trashRestore) {
      errors.push(`Incomplete review decision: ${table}`);
    }
    for (const test of decision.tests) {
      if (!(test in inventoryTestRegistry)) errors.push(`Unknown inventory test: ${table}.${test}`);
    }
  }
  for (const table of Object.keys(decisions)) {
    if (!(table in actual)) errors.push(`Stale table decision: ${table}`);
  }
  return errors;
}

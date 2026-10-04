import { buildOwnedMediaObjectKey, exportSourceKinds } from "@dayli/contracts";
import { describe, expect, it } from "vitest";
import { currentExportJsonColumns, currentExportSchemaColumns, exportDataInventory, exportJsonKeyFamilies, exportObjectNamespaces, validateExportInventory, validateExportJsonFamilies } from "./inventory";

describe("explicit export data inventory", () => {
  const baseline = currentExportSchemaColumns();

  it("accounts for every checked-in table and column without implicit inclusion", () => {
    expect(Object.keys(baseline).length).toBeGreaterThanOrEqual(40);
    expect(validateExportInventory(baseline)).toEqual([]);
    expect(validateExportInventory({ ...baseline, unexpected_table: ["secret"] }))
      .toContain("Unclassified table: unexpected_table");
    expect(validateExportInventory({ ...baseline, user: [...baseline.user!, "new_sensitive_field"] }))
      .toContain("Unclassified or stale columns: user");
    const withoutAuth = { ...baseline };
    delete withoutAuth.account;
    expect(validateExportInventory(withoutAuth)).toContain("Stale table decision: account");
    const unregistered = {
      ...exportDataInventory,
      user: { ...exportDataInventory.user!, tests: ["notRegistered" as never] },
    };
    expect(validateExportInventory(baseline, unregistered)).toContain("Unknown inventory test: user.notRegistered");
  });

  it("keeps selected secret fields, reply pointers, and cleanup keys out of owner projections", () => {
    for (const column of ["password", "access_token", "refresh_token", "id_token"]) {
      expect(exportDataInventory.account!.excluded).toContain(column);
      expect(exportDataInventory.account!.included).not.toContain(column);
    }
    for (const column of ["token", "ip_address", "user_agent"]) {
      expect(exportDataInventory.session!.excluded).toContain(column);
    }
    expect(exportDataInventory.messages!.excluded).toContain("reply_to_message_id");
    expect(exportDataInventory.messages!.included).toContain("body");
    expect(exportDataInventory.messages!.access).toBe("author_and_readable_history_procedure");
    expect(exportDataInventory.media_reservation!.excluded).toContain("object_key");
    expect(exportDataInventory.posts!.excluded).toContain("trash_lease_token");
    expect(exportDataInventory.post_revisions!.transformed?.previous_attachment_refs)
      .toEqual(exportJsonKeyFamilies["post_revisions.previous_attachment_refs"].keys);
  });

  it("registers only the reviewed object namespaces", () => {
    expect(Object.keys(exportObjectNamespaces).sort()).toEqual(["media/", "private/data-exports/v2/"]);
    expect(exportObjectNamespaces["media/"].export).toBe("bytes_after_scoped_authorization");
  });

  it("constructs only slash-free owned media keys", () => {
    expect(buildOwnedMediaObjectKey("owner_1", "media_2")).toBe("media/owner_1/media_2");
    expect(() => buildOwnedMediaObjectKey("other/owner", "media_2")).toThrow();
    expect(() => buildOwnedMediaObjectKey("owner_1", "../secret")).toThrow();
  });

  it("rejects a new JSON family until its keys receive a decision", () => {
    expect(validateExportJsonFamilies(currentExportJsonColumns())).toEqual([]);
    expect(validateExportJsonFamilies([...currentExportJsonColumns(), "user.new_private_json"]))
      .toEqual([expect.stringContaining("user.new_private_json")]);
    const revision = exportJsonKeyFamilies["post_revisions.previous_attachment_refs"];
    const withoutValidator = {
      ...exportJsonKeyFamilies,
      "post_revisions.previous_attachment_refs": { ...revision, validator: "public.invalid-name(jsonb)" as const },
    };
    expect(validateExportJsonFamilies(currentExportJsonColumns(), withoutValidator))
      .toEqual([expect.stringContaining("needs a SQL validator")]);
    const withoutExtraKey = {
      ...exportJsonKeyFamilies,
      "post_revisions.previous_attachment_refs": { ...revision, extraKeyFixture: revision.positiveFixture },
    };
    expect(validateExportJsonFamilies(currentExportJsonColumns(), withoutExtraKey))
      .toEqual([expect.stringContaining("extra-key fixtures")]);
  });

  it("maps every archive source kind to reviewed included tables", () => {
    const sources = {
      profile: ["user"], terms: ["terms_acceptances"], age: ["age_declarations"],
      posts: ["posts"], post_media: ["post_media"], profile_avatars: ["profile_avatars"],
      revisions: ["post_revisions"], notes: ["tomorrow_notes"], messages: ["messages"],
    } as const;
    expect(Object.keys(sources)).toEqual([...exportSourceKinds]);
    for (const tables of Object.values(sources)) {
      for (const table of tables) {
        expect(exportDataInventory[table]!.included.length).toBeGreaterThan(0);
        expect(exportDataInventory[table]!.access).not.toMatch(/^excluded_/);
      }
    }
  });

  it("keeps authentication and push secrets out of the inventory", () => {
    for (const table of ["account", "session", "account_management_grants", "account_google_reauthentication_intents",
      "socket_tickets", "social_link_confirmation", "push_devices", "verification", "registration_intents"] as const) {
      expect(exportDataInventory[table]!.included).toEqual([]);
      expect([...exportDataInventory[table]!.excluded].sort()).toEqual(baseline[table]);
    }
    for (const field of ["tier", "role", "banned", "ban_reason", "legal_registration_admission"]) {
      expect(exportDataInventory.user!.excluded).toContain(field);
    }
  });

  it("keeps recipient and relationship data out of the inventory", () => {
    for (const table of ["conversation_changes", "conversation_members", "conversations", "messaging_participants",
      "message_reactions", "messaging_outbox", "notification_deliveries", "notification_events",
      "friend_requests", "friendships", "relationship_blocks", "post_likes"] as const) {
      expect(exportDataInventory[table]!.included).toEqual([]);
      expect([...exportDataInventory[table]!.excluded].sort()).toEqual(baseline[table]);
    }
    for (const table of ["friend_requests", "friendships", "relationship_blocks"] as const) {
      expect(exportDataInventory[table]!.retainedForOthers).toBe("not_retained_after_either_account_deleted");
      expect(exportDataInventory[table]!.deletion).toBe("remove_when_either_account_permanently_deleted");
    }
  });

  it("keeps lifecycle and operational fields out of the inventory", () => {
    for (const table of ["account_lifecycles", "account_purge_receipts", "data_export_requests",
      "data_export_object_cleanup_tasks", "operator_cases", "post_idempotency_keys", "rateLimit",
      "future_self_note_deliveries", "future_self_note_idempotency_keys",
      "relationship_search_quota"] as const) {
      expect(exportDataInventory[table]!.included).toEqual([]);
      expect([...exportDataInventory[table]!.excluded].sort()).toEqual(baseline[table]);
    }
    expect(exportDataInventory.posts!.excluded).toContain("trash_lease_token");
    expect(exportDataInventory.posts!.excluded).toContain("trash_failure_category");
  });

  it("keeps unproven media and provider URLs out of the inventory", () => {
    expect(exportDataInventory.legacy_cloudinary_media!.included).toEqual([]);
    expect([...exportDataInventory.legacy_cloudinary_media!.excluded].sort()).toEqual(baseline.legacy_cloudinary_media);
    expect(exportDataInventory.media_reservation!.excluded).toContain("object_key");
    expect(exportDataInventory.post_media!.excluded).toContain("reservation_id");
    expect(exportDataInventory.profile_avatars!.excluded).toContain("reservation_id");
  });

  it("keeps catalog and temporary reservation data out of the inventory", () => {
    for (const table of ["daily_prompts", "legal_document_versions", "username_reservations"] as const) {
      expect(exportDataInventory[table]!.included).toEqual([]);
      expect([...exportDataInventory[table]!.excluded].sort()).toEqual(baseline[table]);
    }
  });

  it("records approved profile and legal evidence fields", () => {
    for (const field of ["id", "username", "email", "bio", "profile_visibility", "created_at"]) {
      expect(exportDataInventory.user!.included).toContain(field);
    }
    expect(exportDataInventory.account_notification_preferences!.included).toContain("enabled");
    expect(exportDataInventory.terms_acceptances!.included).toContain("accepted_at");
    expect(exportDataInventory.age_declarations!.included).toContain("declared_at");
  });

  it("records approved journals notes and Trash fields", () => {
    expect(exportDataInventory.posts!.included).toEqual(expect.arrayContaining([
      "reflective_answer", "caption", "trashed_at", "restore_until", "trash_purge_due_at",
    ]));
    expect(exportDataInventory.post_revisions!.transformed?.previous_attachment_refs)
      .toEqual(["media_id", "attachment_order", "status"]);
    expect(exportDataInventory.tomorrow_notes!.included).toContain("note");
    // A future-self note body is withheld from every projection until delivery rules decide otherwise.
    expect(exportDataInventory.future_self_notes!.included).not.toContain("body");
    expect(exportDataInventory.future_self_notes!.excluded).toContain("body");
    expect(exportDataInventory.future_self_notes!.deletion).toBe("purge_with_account");
  });

  it("records authored readable messages without reply previews", () => {
    expect(exportDataInventory.messages!.owner).toBe("sender_participant_id_and_current_readable_history");
    expect(exportDataInventory.messages!.included).toContain("body");
    expect(exportDataInventory.messages!.excluded).toContain("reply_to_message_id");
    expect(exportDataInventory.messages!.retainedForOthers).toBe("retain_for_surviving_recipients");
  });

  it("records authored comments without reply pointers or moderators", () => {
    expect(exportDataInventory.post_comments!.owner).toBe("author_id_and_current_readable_post");
    expect(exportDataInventory.post_comments!.included).toContain("body");
    for (const column of ["parent_comment_id", "client_comment_id", "deleted_by"]) {
      expect(exportDataInventory.post_comments!.excluded).toContain(column);
    }
    expect(exportDataInventory.post_comments!.deletion).toBe("purge_with_post");
  });

  it("records media metadata while withholding raw object keys", () => {
    expect(exportDataInventory.media_reservation!.included).toEqual(["content_type", "byte_size"]);
    expect(exportDataInventory.media_reservation!.excluded).toContain("object_key");
    expect(exportDataInventory.post_media!.included).toContain("post_id");
    expect(exportDataInventory.profile_avatars!.included).toContain("set_at");
  });
});

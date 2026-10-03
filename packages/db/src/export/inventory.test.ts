import { describe, expect, it } from "vitest";
import { currentExportSchemaColumns, exportDataInventory, exportJsonKeyFamilies, exportObjectNamespaces, validateExportInventory } from "./inventory";

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
  });

  it("keeps credentials, received bodies, reply pointers, and cleanup keys out of owner projections", () => {
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
      .toEqual(exportJsonKeyFamilies["post_revisions.previous_attachment_refs"]);
  });

  it("registers only the reviewed object namespaces", () => {
    expect(Object.keys(exportObjectNamespaces).sort()).toEqual(["media/", "private/data-exports/v2/"]);
    expect(exportObjectNamespaces["media/"].export).toBe("bytes_after_scoped_authorization");
  });
});

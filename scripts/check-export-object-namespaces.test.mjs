import assert from "node:assert/strict";
import test from "node:test";
import { findFreeformObjectKeyAssignments } from "./check-export-object-namespaces.mjs";

test("rejects a free-form media or archive object prefix", () => {
  assert.deepEqual(findFreeformObjectKeyAssignments("const objectKey = `media/${ownerId}/${id}`;"), [1]);
  assert.deepEqual(findFreeformObjectKeyAssignments("const archiveObjectKey = 'unreviewed/private.zip';"), [1]);
  assert.deepEqual(findFreeformObjectKeyAssignments("objectKey: \"private/new-prefix/secret\""), [1]);
});

test("accepts a reviewed constructor and a previously authorized key", () => {
  assert.deepEqual(findFreeformObjectKeyAssignments("const objectKey = buildOwnedMediaObjectKey(ownerId, id);"), []);
  assert.deepEqual(findFreeformObjectKeyAssignments("objectKey: reservation.objectKey"), []);
});

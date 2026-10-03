import assert from "node:assert/strict";
import test from "node:test";
import { findUnreviewedObjectWrites } from "./check-export-object-namespaces.mjs";

test("rejects literal paths and direct object-store writes, even through aliases", () => {
  assert.deepEqual(findUnreviewedObjectWrites("const objectKey = `media/${ownerId}/${id}`;"), [1]);
  assert.deepEqual(findUnreviewedObjectWrites("const archiveObjectKey = 'unreviewed/private.zip';"), [1]);
  assert.deepEqual(findUnreviewedObjectWrites("objectKey: \"private/new-prefix/secret\""), [1]);
  assert.deepEqual(findUnreviewedObjectWrites("const key = `private/unreviewed/${id}`;\nawait bucket.put(key, body);"), [2]);
  assert.deepEqual(findUnreviewedObjectWrites("await bucket.put(`private/unreviewed/${id}`, body);"), [1]);
});

test("accepts a reviewed constructor and a previously authorized key", () => {
  assert.deepEqual(findUnreviewedObjectWrites("const objectKey = buildOwnedMediaObjectKey(ownerId, id);"), []);
  assert.deepEqual(findUnreviewedObjectWrites("objectKey: reservation.objectKey"), []);
});

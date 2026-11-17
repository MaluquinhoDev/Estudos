import test from "node:test";
import assert from "node:assert/strict";
import {
  GUEST_KEY,
  OWNER_KEY,
  emptySnapshot,
  loadGuestSnapshot,
  loadUserSnapshot,
  preserveWorkspace,
  saveUserSnapshot,
  userSnapshotKey
} from "../src/powersync/identity.js";

function storageMock(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

const snapshot = title => ({
  schemaVersion: 2,
  courses: [{ id: title, title, modules: [] }],
  cards: [],
  resources: []
});

test("user snapshots are stored in distinct account namespaces", () => {
  const storage = storageMock();
  saveUserSnapshot(storage, "user-A", snapshot("A"));
  saveUserSnapshot(storage, "user-B", snapshot("B"));
  assert.equal(loadUserSnapshot(storage, "user-A").courses[0].title, "A");
  assert.equal(loadUserSnapshot(storage, "user-B").courses[0].title, "B");
  assert.notEqual(userSnapshotKey("user-A"), userSnapshotKey("user-B"));
});

test("legacy data is preserved under its recorded owner before workspace reset", () => {
  const legacy = snapshot("legacy-A");
  const storage = storageMock({
    [OWNER_KEY]: "user-A",
    "estudos-ava-v2": JSON.stringify(legacy)
  });
  preserveWorkspace(storage, legacy);
  assert.equal(loadUserSnapshot(storage, "user-A").courses[0].title, "legacy-A");
  assert.equal(storage.getItem(OWNER_KEY), null);
});

test("unowned legacy data is preserved as guest data, not assigned to an account", () => {
  const storage = storageMock();
  preserveWorkspace(storage, snapshot("guest"));
  assert.equal(loadGuestSnapshot(storage).courses[0].title, "guest");
  assert.deepEqual(loadUserSnapshot(storage, "user-A"), emptySnapshot());
});

test("malformed or incomplete snapshots are rejected", () => {
  const storage = storageMock({
    [userSnapshotKey("user-A")]: JSON.stringify({ schemaVersion: 2, courses: [{ id: "bad" }] })
  });
  assert.deepEqual(loadUserSnapshot(storage, "user-A"), emptySnapshot());
  assert.deepEqual(loadGuestSnapshot(storage), emptySnapshot());
});

test("empty workspace does not overwrite an existing guest backup", () => {
  const storage = storageMock({ [GUEST_KEY]: JSON.stringify(snapshot("guest-backup")) });
  preserveWorkspace(storage, emptySnapshot());
  assert.equal(loadGuestSnapshot(storage).courses[0].title, "guest-backup");
});

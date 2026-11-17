import test from "node:test";
import assert from "node:assert/strict";
import { applySnapshotChanges, hasSnapshotData, mergeSnapshots, planSnapshotChanges, snapshotCounts, snapshotToRows, writeSnapshotToPowerSync } from "../src/powersync/snapshot.js";

const userId = "00000000-0000-4000-8000-000000000001";

test("counts nested AVA records without mutating the input", () => {
  const snapshot = {
    schemaVersion: 2,
    courses: [{
      id: "course-1",
      title: "Algorithms",
      modules: [{ id: "module-1", title: "Sorting", lessons: [{ id: "lesson-1", title: "Merge sort" }] }]
    }],
    cards: [{ id: "card-1", front: "Q", back: "A" }],
    resources: [{ id: "resource-1", title: "Reference" }]
  };
  assert.deepEqual(snapshotCounts(snapshot), {
    courses: 1, modules: 1, lessons: 1, review_cards: 1, resources: 1
  });
  assert.equal(hasSnapshotData(snapshot), true);
  assert.equal(snapshot.courses[0].modules[0].lessons[0].title, "Merge sort");
});

test("maps review cards to their lesson course when courseId is absent", () => {
  const rows = snapshotToRows({
    schemaVersion: 2,
    courses: [{
      id: "course-1",
      title: "Algorithms",
      modules: [{ id: "module-1", title: "Sorting", lessons: [{ id: "lesson-1", title: "Merge sort" }] }]
    }],
    cards: [{ id: "card-1", lessonId: "lesson-1", front: "Q", back: "A" }],
    resources: []
  }, userId);
  assert.equal(rows.review_cards[0].course_id, "course-1");
  assert.equal(rows.review_cards[0].lesson_id, "lesson-1");
  assert.equal(rows.review_cards[0].user_id, userId);
});

test("merges distinct local and remote records without dropping either", () => {
  const local = {
    schemaVersion: 2,
    courses: [{ id: "local-course", title: "Local", modules: [] }],
    cards: [],
    resources: []
  };
  const remote = {
    schemaVersion: 2,
    courses: [{ id: "remote-course", title: "Remote", modules: [] }],
    cards: [],
    resources: []
  };
  const merged = mergeSnapshots(local, remote, userId);
  assert.deepEqual(merged.courses.map(course => course.id).sort(), ["local-course", "remote-course"]);
});

test("rejects conflicting records instead of overwriting either version", () => {
  const local = {
    schemaVersion: 2,
    courses: [{ id: "same-course", title: "Local title", modules: [] }],
    cards: [],
    resources: []
  };
  const remote = {
    schemaVersion: 2,
    courses: [{ id: "same-course", title: "Remote title", modules: [] }],
    cards: [],
    resources: []
  };
  assert.throws(() => mergeSnapshots(local, remote, userId), /Conflito de dados/);
});

test("empty snapshots remain empty", () => {
  assert.equal(hasSnapshotData({ courses: [], cards: [], resources: [] }), false);
});


test("partial or empty bootstrap snapshots never delete existing records", async () => {
  const existing = snapshotToRows({
    schemaVersion: 2,
    courses: [{ id: "kept-course", title: "Keep me", modules: [] }],
    cards: [{ id: "kept-card", front: "Q", back: "A" }],
    resources: [{ id: "kept-resource", title: "Keep" }]
  }, userId);
  const statements = [];
  const database = {
    writeTransaction: async callback => callback({
      getAll: async sql => existing[sql.match(/FROM (\w+)/)[1]],
      execute: async (sql, params) => statements.push({ sql, params })
    })
  };

  await writeSnapshotToPowerSync(database, { schemaVersion: 2, courses: [], cards: [], resources: [] }, userId);
  assert.equal(statements.some(item => item.sql.startsWith("DELETE")), false);
  assert.equal(statements.length, 0);
});

test("snapshot delta deletes only records explicitly removed from its known base", () => {
  const previous = {
    schemaVersion: 2,
    courses: [{ id: "course-1", title: "Course", modules: [] }],
    cards: [{ id: "card-1", front: "Q", back: "A" }],
    resources: [{ id: "resource-1", title: "Resource" }]
  };
  const next = {
    schemaVersion: 2,
    courses: [{ id: "course-1", title: "Course", modules: [] }],
    cards: [],
    resources: [{ id: "resource-1", title: "Resource" }]
  };
  const current = snapshotToRows(previous, userId);
  const plan = planSnapshotChanges(previous, next, current, userId);
  assert.deepEqual(plan.deletes, [{ table: "review_cards", id: "card-1", userId }]);
  assert.equal(plan.upserts.length, 0);
});

test("concurrent remote edits are rejected instead of overwritten", () => {
  const previous = {
    schemaVersion: 2,
    courses: [{ id: "course-1", title: "Original", modules: [] }],
    cards: [],
    resources: []
  };
  const next = {
    schemaVersion: 2,
    courses: [{ id: "course-1", title: "Local edit", modules: [] }],
    cards: [],
    resources: []
  };
  const remote = {
    schemaVersion: 2,
    courses: [{ id: "course-1", title: "Remote edit", modules: [] }],
    cards: [],
    resources: []
  };
  assert.throws(
    () => planSnapshotChanges(previous, next, snapshotToRows(remote, userId), userId),
    /alterado remotamente em paralelo/
  );
});

test("delta writes and explicit deletes execute inside one PowerSync transaction", async () => {
  const previous = {
    schemaVersion: 2,
    courses: [{ id: "course-1", title: "Course", modules: [] }],
    cards: [{ id: "card-1", front: "Q", back: "A" }],
    resources: []
  };
  const next = {
    schemaVersion: 2,
    courses: [{ id: "course-1", title: "Renamed", modules: [] }],
    cards: [],
    resources: []
  };
  const current = snapshotToRows(previous, userId);
  const statements = [];
  let transactionCount = 0;
  const database = {
    writeTransaction: async callback => {
      transactionCount += 1;
      return callback({
        getAll: async sql => current[sql.match(/FROM (\w+)/)[1]],
        execute: async (sql, params) => statements.push({ sql, params })
      });
    }
  };

  await applySnapshotChanges(database, previous, next, userId);
  assert.equal(transactionCount, 1);
  assert.ok(statements.some(item => item.sql.startsWith("DELETE FROM review_cards")));
  assert.ok(statements.some(item => item.sql.startsWith("INSERT INTO courses")));
});

test("obsolete snapshots are discarded before any mutation", async () => {
  const statements = [];
  const database = {
    writeTransaction: async callback => callback({
      getAll: async () => [],
      execute: async (sql, params) => statements.push({ sql, params })
    })
  };
  await assert.rejects(
    applySnapshotChanges(database, { courses: [], cards: [], resources: [] }, {
      schemaVersion: 2,
      courses: [{ id: "course-1", title: "Old", modules: [] }],
      cards: [],
      resources: []
    }, userId, { isCurrent: () => false }),
    /Snapshot obsoleto descartado/
  );
  assert.equal(statements.length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { hasSnapshotData, mergeSnapshots, snapshotCounts, snapshotToRows } from "../src/powersync/snapshot.js";

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

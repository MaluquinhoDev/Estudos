const TABLES = ["courses", "modules", "lessons", "review_cards", "resources"];

const now = () => new Date().toISOString();
const asText = value => value == null ? "" : String(value);

export function snapshotCounts(snapshot) {
  const courses = snapshot?.courses || [];
  return {
    courses: courses.length,
    modules: courses.reduce((n, c) => n + (c.modules || []).length, 0),
    lessons: courses.reduce((n, c) => n + (c.modules || []).reduce((m, x) => m + (x.lessons || []).length, 0), 0),
    review_cards: (snapshot?.cards || []).length,
    resources: (snapshot?.resources || []).length
  };
}

export function hasSnapshotData(snapshot) {
  return Object.values(snapshotCounts(snapshot)).some(Boolean);
}

export function snapshotToRows(snapshot, userId) {
  const stamp = now();
  const courses = (snapshot?.courses || []).map(course => ({
    id: asText(course.id),
    user_id: userId,
    title: asText(course.title),
    category: asText(course.category),
    description: asText(course.description),
    created_at: course.createdAt || stamp,
    updated_at: course.updatedAt || course.createdAt || stamp
  }));
  const modules = [];
  const lessons = [];

  for (const course of snapshot?.courses || []) {
    (course.modules || []).forEach((module, position) => {
      modules.push({
        id: asText(module.id),
        user_id: userId,
        course_id: asText(course.id),
        title: asText(module.title),
        position,
        created_at: module.createdAt || stamp,
        updated_at: module.updatedAt || module.createdAt || stamp
      });
      (module.lessons || []).forEach(lesson => {
        lessons.push({
          id: asText(lesson.id),
          user_id: userId,
          course_id: asText(course.id),
          module_id: asText(module.id),
          title: asText(lesson.title),
          description: asText(lesson.description),
          notes: asText(lesson.notes),
          status: asText(lesson.status || "planned"),
          created_at: lesson.createdAt || stamp,
          updated_at: lesson.updatedAt || lesson.createdAt || stamp
        });
      });
    });
  }

  const courseByLesson = new Map(lessons.map(lesson => [lesson.id, lesson.course_id]));
  const courseTitleById = new Map(courses.map(course => [course.id, course.title]));
  const review_cards = (snapshot?.cards || []).map(card => {
    const courseId = courseByLesson.get(card.lessonId) || card.courseId || null;
    return ({
    id: asText(card.id),
    user_id: userId,
    course_id: courseId,
    lesson_id: card.lessonId || null,
    course_title: asText(courseTitleById.get(courseId) || card.courseTitle),
    front: asText(card.front),
    back: asText(card.back),
    due: card.due || null,
    interval: Number.isInteger(card.interval) ? card.interval : 0,
    repetitions: Number.isInteger(card.repetitions) ? card.repetitions : 0,
    last_reviewed: card.lastReviewed || null,
    created_at: card.createdAt || stamp,
    updated_at: card.updatedAt || card.createdAt || stamp
  });
  });

  const resources = (snapshot?.resources || []).map(resource => ({
    id: asText(resource.id),
    user_id: userId,
    course_id: resource.courseId || null,
    title: asText(resource.title),
    type: asText(resource.type || "Outro"),
    url: asText(resource.url),
    description: asText(resource.description),
    course_title: asText(resource.courseTitle),
    created_at: resource.createdAt || stamp,
    updated_at: resource.updatedAt || resource.createdAt || stamp
  }));

  return { courses, modules, lessons, review_cards, resources };
}

export async function readPowerSyncSnapshot(database) {
  const [courses, modules, lessons, cards, resources] = await Promise.all([
    database.getAll("SELECT * FROM courses"),
    database.getAll("SELECT * FROM modules ORDER BY position"),
    database.getAll("SELECT * FROM lessons"),
    database.getAll("SELECT * FROM review_cards"),
    database.getAll("SELECT * FROM resources")
  ]);

  return {
    schemaVersion: 2,
    courses: courses.map(course => ({
      id: course.id,
      title: course.title,
      category: course.category || "",
      description: course.description || "",
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      modules: modules.filter(module => module.course_id === course.id).map(module => ({
        id: module.id,
        title: module.title,
        createdAt: module.created_at,
        updatedAt: module.updated_at,
        lessons: lessons.filter(lesson => lesson.module_id === module.id).map(lesson => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description || "",
          notes: lesson.notes || "",
          status: lesson.status || "planned",
          createdAt: lesson.created_at,
          updatedAt: lesson.updated_at
        }))
      }))
    })),
    cards: cards.map(card => ({
      id: card.id,
      courseId: card.course_id || "",
      courseTitle: card.course_title || "",
      lessonId: card.lesson_id || "",
      front: card.front,
      back: card.back,
      due: card.due || "",
      interval: card.interval || 0,
      repetitions: card.repetitions || 0,
      lastReviewed: card.last_reviewed || ""
    })),
    resources: resources.map(resource => ({
      id: resource.id,
      title: resource.title,
      type: resource.type || "Outro",
      url: resource.url || "",
      description: resource.description || "",
      courseId: resource.course_id || "",
      courseTitle: resource.course_title || ""
    }))
  };
}

const CONTENT_FIELDS = {
  courses: ["title", "category", "description"],
  modules: ["course_id", "title", "position"],
  lessons: ["course_id", "module_id", "title", "description", "notes", "status"],
  review_cards: ["course_id", "lesson_id", "course_title", "front", "back", "due", "interval", "repetitions", "last_reviewed"],
  resources: ["course_id", "title", "type", "url", "description", "course_title"]
};

function sameContent(a, b, table) {
  return CONTENT_FIELDS[table].every(field => (a[field] ?? null) === (b[field] ?? null));
}

function indexRows(rows) {
  return new Map(rows.map(row => [row.id, row]));
}

function conflict(table, id, reason) {
  throw new Error("Conflito de sincronização em " + table + "/" + id + ": " + reason);
}

/**
 * Calculates mutations from a known base snapshot to a newer local snapshot.
 * A missing row is a delete only when it existed in the known base.
 * Concurrent remote changes are rejected instead of silently overwritten.
 */
export function planSnapshotChanges(previousSnapshot, nextSnapshot, currentRows, userId) {
  if (!userId) throw new Error("Identidade obrigatória para alterar dados PowerSync.");
  const previous = snapshotToRows(previousSnapshot || { courses: [], cards: [], resources: [] }, userId);
  const next = snapshotToRows(nextSnapshot, userId);
  const plan = { deletes: [], upserts: [] };

  for (const table of [...TABLES].reverse()) {
    const before = indexRows(previous[table]);
    const after = indexRows(next[table]);
    const current = indexRows(currentRows[table] || []);

    for (const [id, oldRow] of before) {
      if (after.has(id)) continue;
      const stored = current.get(id);
      if (!stored) continue;
      if (!sameContent(stored, oldRow, table)) {
        conflict(table, id, "o registro foi alterado remotamente antes da exclusão");
      }
      plan.deletes.push({ table, id, userId });
    }
  }

  for (const table of TABLES) {
    const before = indexRows(previous[table]);
    const after = indexRows(next[table]);
    const current = indexRows(currentRows[table] || []);

    for (const [id, nextRow] of after) {
      const oldRow = before.get(id);
      const stored = current.get(id);

      if (oldRow && sameContent(oldRow, nextRow, table)) continue;

      if (!oldRow) {
        if (!stored) {
          plan.upserts.push({ table, row: nextRow });
          continue;
        }
        if (sameContent(stored, nextRow, table)) continue;
        conflict(table, id, "o registro já existe com conteúdo diferente da base local");
      }

      if (!stored) {
        conflict(table, id, "o registro foi removido remotamente");
      }
      if (sameContent(stored, nextRow, table)) continue;
      if (!sameContent(stored, oldRow, table)) {
        conflict(table, id, "o registro foi alterado remotamente em paralelo");
      }

      plan.upserts.push({
        table,
        row: {
          ...nextRow,
          created_at: stored.created_at || nextRow.created_at,
          updated_at: now()
        }
      });
    }
  }

  return plan;
}

async function readRowsInTransaction(tx) {
  const rows = {};
  for (const table of TABLES) {
    rows[table] = await tx.getAll("SELECT * FROM " + table);
  }
  return rows;
}

async function executeMutationPlan(tx, plan) {
  for (const item of plan.deletes) {
    await tx.execute(
      "DELETE FROM " + item.table + " WHERE id = ? AND user_id = ?",
      [item.id, item.userId]
    );
  }

  for (const { table, row } of plan.upserts) {
    const columns = Object.keys(row);
    const placeholders = columns.map(() => "?").join(", ");
    const updates = columns
      .filter(column => column !== "id")
      .map(column => column + " = excluded." + column)
      .join(", ");
    await tx.execute(
      "INSERT INTO " + table + " (" + columns.join(", ") + ") VALUES (" + placeholders +
      ") ON CONFLICT(id) DO UPDATE SET " + updates,
      columns.map(column => row[column] ?? null)
    );
  }
}

/**
 * Applies an incremental, optimistic-concurrency-checked snapshot delta.
 * Reads and writes happen under the same PowerSync transaction lock.
 */
export async function applySnapshotChanges(database, previousSnapshot, nextSnapshot, userId, options = {}) {
  await database.writeTransaction(async tx => {
    if (options.isCurrent && !options.isCurrent()) throw new Error("Snapshot obsoleto descartado.");
    const currentRows = await readRowsInTransaction(tx);
    if (options.isCurrent && !options.isCurrent()) throw new Error("Snapshot obsoleto descartado.");
    const plan = planSnapshotChanges(previousSnapshot, nextSnapshot, currentRows, userId);
    if (options.isCurrent && !options.isCurrent()) throw new Error("Snapshot obsoleto descartado.");
    await executeMutationPlan(tx, plan);
    if (options.isCurrent && !options.isCurrent()) throw new Error("Snapshot obsoleto descartado.");
  });
}

/**
 * Bootstrap/import path: additive only. Existing records are never deleted or
 * overwritten; conflicting content must be reconciled explicitly.
 */
export async function writeSnapshotToPowerSync(database, snapshot, userId) {
  return applySnapshotChanges(database, { schemaVersion: 2, courses: [], cards: [], resources: [] }, snapshot, userId);
}

export function mergeSnapshots(localSnapshot, remoteSnapshot, userId) {
  const local = snapshotToRows(localSnapshot, userId);
  const remote = snapshotToRows(remoteSnapshot, userId);
  const merged = {};

  for (const table of TABLES) {
    const byId = new Map(remote[table].map(row => [row.id, row]));
    for (const row of local[table]) {
      const existing = byId.get(row.id);
      if (existing && !sameContent(existing, row, table)) {
        throw new Error("Conflito de dados na tabela " + table + ", registro " + row.id);
      }
      if (!existing) byId.set(row.id, row);
    }
    merged[table] = [...byId.values()];
  }

  const courses = merged.courses.map(course => ({
    id: course.id,
    title: course.title,
    category: course.category,
    description: course.description,
    createdAt: course.created_at,
    updatedAt: course.updated_at,
    modules: merged.modules.filter(module => module.course_id === course.id).sort((a, b) => a.position - b.position).map(module => ({
      id: module.id,
      title: module.title,
      createdAt: module.created_at,
      updatedAt: module.updated_at,
      lessons: merged.lessons.filter(lesson => lesson.module_id === module.id).map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        notes: lesson.notes,
        status: lesson.status,
        createdAt: lesson.created_at,
        updatedAt: lesson.updated_at
      }))
    }))
  }));

  return {
    schemaVersion: 2,
    courses,
    cards: merged.review_cards.map(card => ({
      id: card.id,
      courseId: card.course_id || "",
      courseTitle: card.course_title,
      lessonId: card.lesson_id || "",
      front: card.front,
      back: card.back,
      due: card.due || "",
      interval: card.interval,
      repetitions: card.repetitions,
      lastReviewed: card.last_reviewed || ""
    })),
    resources: merged.resources.map(resource => ({
      id: resource.id,
      title: resource.title,
      type: resource.type,
      url: resource.url,
      description: resource.description,
      courseId: resource.course_id || "",
      courseTitle: resource.course_title
    })),
    researchSources: Array.isArray(localSnapshot?.researchSources) ? localSnapshot.researchSources : [],
    researchSearches: Array.isArray(localSnapshot?.researchSearches) ? localSnapshot.researchSearches : [],
    studyMaterials: Array.isArray(localSnapshot?.studyMaterials) ? localSnapshot.studyMaterials : []
  };
}

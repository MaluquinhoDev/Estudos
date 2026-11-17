import test from "node:test";
import assert from "node:assert/strict";
import { UpdateType } from "@powersync/web";
import { SupabasePowerSyncConnector } from "../src/powersync/connector.js";

const user = { id: "00000000-0000-4000-8000-000000000001" };

function makeHarness(rows) {
  const calls = [];
  let completed = false;
  const builder = {
    upsert(payload, options) {
      calls.push(["upsert", payload, options]);
      return Promise.resolve({ data: null, error: null });
    },
    update(payload) {
      calls.push(["update", payload]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    select(columns) {
      calls.push(["select", columns]);
      return Promise.resolve({ data: rows, error: null });
    }
  };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user } }, error: null })
    },
    from: table => {
      calls.push(["from", table]);
      return builder;
    }
  };
  const transaction = {
    crud: [{
      op: UpdateType.PATCH,
      table: "courses",
      id: "course-1",
      opData: { title: "Updated title" }
    }],
    complete: async () => { completed = true; }
  };
  const database = { getNextCrudTransaction: async () => transaction };
  return {
    connector: new SupabasePowerSyncConnector({ supabase, endpoint: "https://example.powersync.journeyapps.com" }),
    database,
    calls,
    wasCompleted: () => completed
  };
}

test("PATCH acknowledges only after exactly one owned row is returned", async () => {
  const harness = makeHarness([{ id: "course-1" }]);
  await harness.connector.uploadData(harness.database);
  assert.equal(harness.wasCompleted(), true);
  assert.ok(harness.calls.some(call => call[0] === "eq" && call[1] === "user_id" && call[2] === user.id));
  assert.ok(harness.calls.some(call => call[0] === "select" && call[1] === "id"));
});

test("PATCH keeps the CRUD transaction pending when no owned row is updated", async () => {
  const harness = makeHarness([]);
  await assert.rejects(
    harness.connector.uploadData(harness.database),
    /não encontrou exatamente um registro próprio/
  );
  assert.equal(harness.wasCompleted(), false);
});


test("PUT upserts against the actual composite tenant primary key", async () => {
  const calls = [];
  let completed = false;
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user } }, error: null })
    },
    from: table => ({
      upsert: async (record, options) => {
        calls.push({ table, record, options });
        return { data: null, error: null };
      }
    })
  };
  const transaction = {
    crud: [{
      op: UpdateType.PUT,
      table: "courses",
      id: "course-1",
      opData: { title: "Course", user_id: "untrusted-user" }
    }],
    complete: async () => { completed = true; }
  };
  const database = { getNextCrudTransaction: async () => transaction };
  const connector = new SupabasePowerSyncConnector({
    supabase,
    endpoint: "https://example.powersync.journeyapps.com"
  });

  await connector.uploadData(database);
  assert.equal(completed, true);
  assert.equal(calls[0].options.onConflict, "id,user_id");
  assert.equal(calls[0].record.id, "course-1");
  assert.equal(calls[0].record.user_id, user.id);
});

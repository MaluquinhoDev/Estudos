const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  powersyncUrl: import.meta.env.VITE_POWERSYNC_URL
};

const panel = document.querySelector("#sync-panel");
const dialog = document.querySelector("#sync-dialog");
const form = document.querySelector("#sync-auth-form");
const message = document.querySelector("#sync-message");
const submit = document.querySelector("#sync-submit");
let database;
let databaseUserId = null;
let disposeChangeListener = null;
let connector;
let supabase;
let PowerSyncDatabase;
let WASQLiteVFS;
let EstudosSchema;
let SupabasePowerSyncConnector;
let snapshotTools;
let syncing = false;
let suppressLocalEventsForUser = null;
let applyingPowerSyncChangesForUser = null;
let syncQueue = Promise.resolve();
let lastAppliedSnapshot = null;
let latestLocalRevision = 0;
let sessionGeneration = 0;
let isolatedUserId = null;
import {
  OWNER_KEY,
  emptySnapshot,
  loadGuestSnapshot,
  loadUserSnapshot,
  preserveWorkspace,
  saveUserSnapshot
} from "./powersync/identity.js";

async function waitForAppBridge() {
  if (window.EstudosBridge) return;
  await new Promise(resolve => window.addEventListener("estudos:app-ready", resolve, { once: true }));
}

function hideWorkspace() {
  window.EstudosBridge?.setIdentityPending?.();
}

function revealWorkspace() {
  window.EstudosBridge?.setIdentityReady?.();
}

function persistWorkspaceSnapshot(userId, snapshot) {
  saveUserSnapshot(localStorage, userId, snapshot);
}

function isolateCurrentWorkspace() {
  const snapshot = window.EstudosBridge?.getSnapshot?.() || emptySnapshot();
  isolatedUserId = currentUser?.id || localStorage.getItem(OWNER_KEY);
  preserveWorkspace(localStorage, snapshot, currentUser?.id || null);
  window.EstudosBridge?.clearSnapshot?.();
}

function restoreGuestWorkspace() {
  window.EstudosBridge?.setPedagogyOwner?.("guest");
  window.EstudosBridge?.replaceSnapshot?.(loadGuestSnapshot(localStorage));
}

function readUserWorkspace(userId) {
  return loadUserSnapshot(localStorage, userId);
}

function showMessage(text, kind = "info") {
  if (message) {
    message.textContent = text;
    message.dataset.kind = kind;
  }
  const status = document.querySelector("#sync-status");
  if (status) status.textContent = text;
}

function setPanel(html) {
  if (panel) panel.innerHTML = html;
}

function configured() {
  return Boolean(config.supabaseUrl && config.supabaseKey && config.powersyncUrl);
}

async function loadPowerSyncModules() {
  if (PowerSyncDatabase) return;
  const [sdk, schema, connectorModule, snapshotModule] = await Promise.all([
    import("@powersync/web"),
    import("./powersync/schema.js"),
    import("./powersync/connector.js"),
    import("./powersync/snapshot.js")
  ]);
  PowerSyncDatabase = sdk.PowerSyncDatabase;
  WASQLiteVFS = sdk.WASQLiteVFS;
  EstudosSchema = schema.EstudosSchema;
  SupabasePowerSyncConnector = connectorModule.SupabasePowerSyncConnector;
  snapshotTools = snapshotModule;
}

function createDatabase(userId) {
  if (database && databaseUserId === userId) return database;
  database = new PowerSyncDatabase({
    schema: EstudosSchema,
    database: {
      dbFilename: "estudos-ava-" + userId + ".db",
      vfs: WASQLiteVFS.IDBBatchAtomicVFS
    }
  });
  databaseUserId = userId;
  return database;
}

async function stopSync({ invalidate = true } = {}) {
  if (invalidate) sessionGeneration += 1;
  if (invalidate) {
    lastAppliedSnapshot = null;
    latestLocalRevision = 0;
  }
  if (disposeChangeListener) {
    disposeChangeListener();
    disposeChangeListener = null;
  }
  window.removeEventListener("estudos:data-saved", onLocalDataSaved);
  if (database && syncing) {
    await database.disconnect();
    syncing = false;
  }
}

async function startSync(session) {
  if (startingUserId === session.user.id) return;
  const userId = session.user.id;
  const generation = ++sessionGeneration;
  const isCurrentSession = () => generation === sessionGeneration && currentUser?.id === userId;
  startingUserId = userId;
  try {
    await loadPowerSyncModules();
    if (!isCurrentSession()) return;
    await stopSync({ invalidate: false });
    if (!isCurrentSession()) return;
    const db = createDatabase(userId);
    connector = new SupabasePowerSyncConnector({
      supabase,
      endpoint: config.powersyncUrl
    });

    const connection = db.connect(connector);
    syncing = true;
    connection.catch(error => {
      if (!isCurrentSession()) return;
      console.error("PowerSync connection failed:", error);
      showMessage("Conexão PowerSync interrompida: " + error.message, "error");
    });
    showMessage("Conectando ao banco local e sincronizando…");

    await db.waitForFirstSync();
    if (!isCurrentSession()) return;
    const remote = await snapshotTools.readPowerSyncSnapshot(db);
    if (!isCurrentSession()) return;
    const local = readUserWorkspace(userId);

    let merged;
    if (!snapshotTools.hasSnapshotData(remote)) {
      merged = local;
    } else if (!snapshotTools.hasSnapshotData(local)) {
      merged = remote;
    } else {
      merged = snapshotTools.mergeSnapshots(local, remote, session.user.id);
    }

    suppressLocalEventsForUser = userId;
    try {
      await snapshotTools.writeSnapshotToPowerSync(db, merged, userId);
      if (!isCurrentSession()) return;
      persistWorkspaceSnapshot(userId, merged);
      localStorage.setItem(OWNER_KEY, userId);
      window.EstudosBridge?.replaceSnapshot?.(merged);
      lastAppliedSnapshot = merged;
      latestLocalRevision = 0;
    } finally {
      if (suppressLocalEventsForUser === userId) suppressLocalEventsForUser = null;
    }

    if (!isCurrentSession()) return;
    window.addEventListener("estudos:data-saved", onLocalDataSaved);
    disposeChangeListener = db.onChange({
      onChange: async () => {
        if (!isCurrentSession() || applyingPowerSyncChangesForUser === userId) return;
        applyingPowerSyncChangesForUser = userId;
        const localRevisionAtStart = latestLocalRevision;
        try {
          const latest = await snapshotTools.readPowerSyncSnapshot(db);
          if (!isCurrentSession() || latestLocalRevision !== localRevisionAtStart) return;
          persistWorkspaceSnapshot(userId, latest);
          lastAppliedSnapshot = latest;
          suppressLocalEventsForUser = userId;
          try {
            window.EstudosBridge?.replaceSnapshot?.(latest);
          } finally {
            if (suppressLocalEventsForUser === userId) suppressLocalEventsForUser = null;
          }
        } catch (error) {
          console.error("PowerSync remote update could not be applied:", error);
          showMessage("Atualização recebida, mas a tela não foi atualizada: " + error.message, "error");
        } finally {
          if (applyingPowerSyncChangesForUser === userId) applyingPowerSyncChangesForUser = null;
        }
      }
    }, { tables: ["courses", "modules", "lessons", "review_cards", "resources"], throttleMs: 350 });
    showMessage("Sincronização ativa. Dados locais e remotos conciliados.", "success");
    isolatedUserId = null;
    revealWorkspace();
  } catch (error) {
    if (isCurrentSession()) {
      console.error("PowerSync initialization failed:", error);
      showMessage("Sincronização pausada para proteger seus dados: " + error.message, "error");
      await stopSync({ invalidate: false });
    }
    throw error;
  } finally {
    if (startingUserId === userId) startingUserId = null;
  }
}

function onLocalDataSaved(event) {
  if (!syncing || suppressLocalEventsForUser === currentUser?.id) return;
  const payload = event.detail || {};
  const snapshot = payload.snapshot;
  const revision = Number(payload.revision);
  const ownerId = currentUser?.id;
  const targetDatabase = database;
  if (!ownerId || !targetDatabase || !snapshot || !Number.isSafeInteger(revision)) return;
  if (revision <= latestLocalRevision) return;

  latestLocalRevision = revision;
  persistWorkspaceSnapshot(ownerId, snapshot);
  syncQueue = syncQueue
    .then(async () => {
      if (currentUser?.id !== ownerId || database !== targetDatabase || !syncing) return;
      if (revision !== latestLocalRevision) return;
      const base = lastAppliedSnapshot || emptySnapshot();
      await snapshotTools.applySnapshotChanges(
        targetDatabase,
        base,
        snapshot,
        ownerId,
        { isCurrent: () => currentUser?.id === ownerId && database === targetDatabase && syncing && revision === latestLocalRevision }
      );
      lastAppliedSnapshot = snapshot;
    })
    .catch(error => {
      if (error?.message === "Snapshot obsoleto descartado.") return;
      console.error("PowerSync local write failed:", error);
      showMessage("Alteração salva neste aparelho; sincronização pendente: " + error.message, "error");
    });
}

let currentUser = null;
let startingUserId = null;

function renderSignedOut() {
  setPanel('<button class="secondary sync-button" id="sync-open">Entrar / Criar conta</button><small class="sync-caption">Sincronização entre dispositivos</small>');
  document.querySelector("#sync-open")?.addEventListener("click", () => {
    showMessage("Entre com seu e-mail e senha. Os dados locais não serão apagados.");
    dialog?.showModal();
  });
}

function renderSignedIn(user) {
  setPanel('<div class="sync-user"><span class="sync-indicator"></span><span><strong>Conta conectada</strong><small>' +
    escapeHtml(user.email || user.id) + '</small><small id="sync-status">Preparando sincronização…</small></span></div><button class="secondary sync-button" id="sync-logout">Sair da conta</button>');
  document.querySelector("#sync-logout")?.addEventListener("click", async () => {
    hideWorkspace();
    isolateCurrentWorkspace();
    await stopSync();
    const { error } = await supabase.auth.signOut();
    if (error) {
      currentUser = user;
      isolatedUserId = null;
      localStorage.setItem(OWNER_KEY, user.id);
      window.EstudosBridge?.replaceSnapshot?.(readUserWorkspace(user.id));
      revealWorkspace();
      showMessage(error.message, "error");
    }
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

async function authenticate(event) {
  event.preventDefault();
  const values = new FormData(form);
  const email = String(values.get("email") || "").trim();
  const password = String(values.get("password") || "");
  const mode = String(values.get("mode") || "signin");

  submit.disabled = true;
  showMessage("Autenticando…");
  try {
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;
    if (!result.data.session) {
      showMessage("Conta criada. Confirme o e-mail antes de entrar.");
      return;
    }
    dialog.close();
    // The SIGNED_IN auth event owns session initialization to avoid duplicate startup races.
  } catch (error) {
    showMessage(error.message || "Falha de autenticação.", "error");
  } finally {
    submit.disabled = false;
  }
}

await waitForAppBridge();

if (!configured()) {
  isolateCurrentWorkspace();
  restoreGuestWorkspace();
  setPanel('<small class="sync-caption">Sincronização ainda não configurada</small>');
  revealWorkspace();
} else if (!panel || !dialog || !form || !message || !submit) {
  console.error("PowerSync UI elements are missing from index.html");
} else {
  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  form.addEventListener("submit", authenticate);
  document.querySelector("#sync-signup")?.addEventListener("click", () => {
    form.elements.mode.value = "signup";
    submit.textContent = "Criar conta";
  });
  document.querySelector("#sync-signin")?.addEventListener("click", () => {
    form.elements.mode.value = "signin";
    submit.textContent = "Entrar";
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (event === "SIGNED_OUT" || !session?.user) {
      hideWorkspace();
      if (!currentUser || isolatedUserId !== currentUser.id) isolateCurrentWorkspace();
      currentUser = null;
      isolatedUserId = null;
      window.EstudosBridge?.setPedagogyOwner?.("guest");
      await stopSync();
      restoreGuestWorkspace();
      renderSignedOut();
      revealWorkspace();
      return;
    }
    if (currentUser?.id !== session.user.id) {
      hideWorkspace();
      isolateCurrentWorkspace();
      currentUser = session.user;
      isolatedUserId = null;
      window.EstudosBridge?.setPedagogyOwner?.(currentUser.id);
      renderSignedIn(currentUser);
      try {
        await startSync(session);
      } catch {
        window.EstudosBridge?.clearSnapshot?.();
        revealWorkspace();
      }
    }
  });

  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) {
      showMessage(error.message, "error");
      isolateCurrentWorkspace();
      restoreGuestWorkspace();
      renderSignedOut();
      revealWorkspace();
      return;
    }
    if (data.session?.user) {
      hideWorkspace();
      isolateCurrentWorkspace();
      currentUser = data.session.user;
      isolatedUserId = null;
      window.EstudosBridge?.setPedagogyOwner?.(currentUser.id);
      renderSignedIn(currentUser);
      try {
        await startSync(data.session);
      } catch {
        window.EstudosBridge?.clearSnapshot?.();
        revealWorkspace();
      }
    } else {
      isolateCurrentWorkspace();
      restoreGuestWorkspace();
      renderSignedOut();
      revealWorkspace();
    }
  });
}

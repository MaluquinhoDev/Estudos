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
let suppressLocalEvents = false;
let applyingPowerSyncChanges = false;
let syncQueue = Promise.resolve();
let sessionGeneration = 0;
const OWNER_KEY = "estudos-ava-owner";
const GUEST_KEY = "estudos-ava-guest-v2";
const USER_KEY_PREFIX = "estudos-ava-v2:user:";
const emptySnapshot = () => ({ schemaVersion: 2, courses: [], cards: [], resources: [] });
const userSnapshotKey = userId => USER_KEY_PREFIX + encodeURIComponent(userId);

function hideWorkspace() {
  window.EstudosBridge?.setIdentityPending?.();
}

function revealWorkspace() {
  window.EstudosBridge?.setIdentityReady?.();
}

function persistWorkspaceSnapshot(userId, snapshot) {
  if (!userId || !snapshot) return;
  localStorage.setItem(userSnapshotKey(userId), JSON.stringify(snapshot));
}

function isolateCurrentWorkspace() {
  const snapshot = window.EstudosBridge?.getSnapshot?.() || emptySnapshot();
  const storedOwner = localStorage.getItem(OWNER_KEY);
  const activeOwner = currentUser?.id || storedOwner;
  if (activeOwner) {
    persistWorkspaceSnapshot(activeOwner, snapshot);
  } else if (snapshotTools?.hasSnapshotData(snapshot) || snapshot.courses?.length || snapshot.cards?.length || snapshot.resources?.length) {
    localStorage.setItem(GUEST_KEY, JSON.stringify(snapshot));
  }
  localStorage.removeItem(OWNER_KEY);
  window.EstudosBridge?.clearSnapshot?.();
}

function restoreGuestWorkspace() {
  let guest = emptySnapshot();
  try {
    const stored = localStorage.getItem(GUEST_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.schemaVersion === 2 && Array.isArray(parsed.courses) && Array.isArray(parsed.cards) && Array.isArray(parsed.resources)) guest = parsed;
    }
  } catch (error) {
    console.warn("Guest snapshot could not be restored:", error);
  }
  window.EstudosBridge?.replaceSnapshot?.(guest);
}

function readUserWorkspace(userId) {
  try {
    const stored = localStorage.getItem(userSnapshotKey(userId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.schemaVersion === 2 && Array.isArray(parsed.courses) && Array.isArray(parsed.cards) && Array.isArray(parsed.resources)) return parsed;
    }
  } catch (error) {
    console.warn("User snapshot could not be restored:", error);
  }
  return emptySnapshot();
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

    suppressLocalEvents = true;
    try {
      await snapshotTools.writeSnapshotToPowerSync(db, merged, userId);
      if (!isCurrentSession()) return;
      persistWorkspaceSnapshot(userId, merged);
      window.EstudosBridge?.replaceSnapshot?.(merged);
    } finally {
      suppressLocalEvents = false;
    }

    if (!isCurrentSession()) return;
    localStorage.setItem(OWNER_KEY, userId);
    window.addEventListener("estudos:data-saved", onLocalDataSaved);
    disposeChangeListener = db.onChange({
      onChange: async () => {
        if (!isCurrentSession() || applyingPowerSyncChanges) return;
        applyingPowerSyncChanges = true;
        suppressLocalEvents = true;
        try {
          const latest = await snapshotTools.readPowerSyncSnapshot(db);
          if (!isCurrentSession()) return;
          persistWorkspaceSnapshot(userId, latest);
          window.EstudosBridge?.replaceSnapshot?.(latest);
        } catch (error) {
          console.error("PowerSync remote update could not be applied:", error);
          showMessage("Atualização recebida, mas a tela não foi atualizada: " + error.message, "error");
        } finally {
          suppressLocalEvents = false;
          applyingPowerSyncChanges = false;
        }
      }
    }, { tables: ["courses", "modules", "lessons", "review_cards", "resources"], throttleMs: 350 });
    showMessage("Sincronização ativa. Dados locais e remotos conciliados.", "success");
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
  if (!syncing || suppressLocalEvents) return;
  const snapshot = event.detail;
  const ownerId = currentUser?.id;
  const targetDatabase = database;
  if (!ownerId || !targetDatabase) return;
  persistWorkspaceSnapshot(ownerId, snapshot);
  syncQueue = syncQueue
    .then(() => {
      if (currentUser?.id !== ownerId || database !== targetDatabase || !syncing) return;
      return snapshotTools.writeSnapshotToPowerSync(targetDatabase, snapshot, ownerId);
    })
    .catch(error => {
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
    await stopSync();
    const { error } = await supabase.auth.signOut();
    if (error) showMessage(error.message, "error");
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
    await startSync(result.data.session);
  } catch (error) {
    showMessage(error.message || "Falha de autenticação.", "error");
  } finally {
    submit.disabled = false;
  }
}

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
    if (event === "SIGNED_OUT" || !session?.user) {
      hideWorkspace();
      isolateCurrentWorkspace();
      currentUser = null;
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

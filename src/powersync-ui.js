const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  powersyncUrl: import.meta.env.VITE_POWERSYNC_URL
};

const panel = document.querySelector("#sync-panel");
const dialog = document.querySelector("#sync-dialog");
const form = document.querySelector("#sync-auth-form");
const message = document.querySelector("#sync-message");
const account = document.querySelector("#sync-account");
const submit = document.querySelector("#sync-submit");
let database;
let connector;
let supabase;
let PowerSyncDatabase;
let WASQLiteVFS;
let EstudosSchema;
let SupabasePowerSyncConnector;
let snapshotTools;
let syncing = false;
let suppressLocalEvents = false;
let syncQueue = Promise.resolve();

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

function createDatabase() {
  if (database) return database;
  database = new PowerSyncDatabase({
    schema: EstudosSchema,
    database: {
      dbFilename: "estudos-ava.db",
      vfs: WASQLiteVFS.IDBBatchAtomicVFS
    }
  });
  return database;
}

async function stopSync() {
  if (database && syncing) {
    await database.disconnect();
    syncing = false;
  }
}

async function startSync(session) {
  if (startingUserId === session.user.id) return;
  startingUserId = session.user.id;
  try {
    await loadPowerSyncModules();
    const db = createDatabase();
    connector = new SupabasePowerSyncConnector({
      supabase,
      endpoint: config.powersyncUrl
    });

    await stopSync();
    const connection = db.connect(connector);
    syncing = true;
    connection.catch(error => {
      console.error("PowerSync connection failed:", error);
      showMessage("Conexão PowerSync interrompida: " + error.message, "error");
    });
    showMessage("Conectando ao banco local e sincronizando…");

    await db.waitForFirstSync();
    const remote = await snapshotTools.readPowerSyncSnapshot(db);
    const local = window.EstudosBridge?.getSnapshot?.() || {
      schemaVersion: 2, courses: [], cards: [], resources: []
    };
    const ownerKey = "estudos-ava-owner";
    const previousOwner = localStorage.getItem(ownerKey);
    if (previousOwner && previousOwner !== session.user.id && snapshotTools.hasSnapshotData(local)) {
      throw new Error("Os dados locais pertencem a outra conta. Exporte o backup antes de trocar de usuário e limpe os dados locais para iniciar uma conta diferente.");
    }

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
      await snapshotTools.writeSnapshotToPowerSync(db, merged, session.user.id);
      window.EstudosBridge?.replaceSnapshot?.(merged);
    } finally {
      suppressLocalEvents = false;
    }

    localStorage.setItem(ownerKey, session.user.id);
    window.removeEventListener("estudos:data-saved", onLocalDataSaved);
    window.addEventListener("estudos:data-saved", onLocalDataSaved);
    showMessage("Sincronização ativa. Dados locais e remotos conciliados.", "success");
  } catch (error) {
    console.error("PowerSync initialization failed:", error);
    showMessage("Sincronização pausada para proteger seus dados: " + error.message, "error");
    await stopSync();
    throw error;
  } finally {
    startingUserId = null;
  }
}

function onLocalDataSaved(event) {
  if (!syncing || suppressLocalEvents) return;
  const snapshot = event.detail;
  syncQueue = syncQueue
    .then(() => snapshotTools.writeSnapshotToPowerSync(database, snapshot, currentUser.id))
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
  setPanel('<small class="sync-caption">Sincronização ainda não configurada</small>');
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
    if (event === "SIGNED_OUT") {
      currentUser = null;
      await stopSync();
      renderSignedOut();
      return;
    }
    if (session?.user && currentUser?.id !== session.user.id) {
      currentUser = session.user;
      renderSignedIn(currentUser);
      try {
        await startSync(session);
      } catch {
        // The error is already shown without clearing either local or remote data.
      }
    }
  });

  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) {
      showMessage(error.message, "error");
      return;
    }
    if (data.session?.user) {
      currentUser = data.session.user;
      renderSignedIn(currentUser);
      try {
        await startSync(data.session);
      } catch {
        // The error is already shown without clearing either local or remote data.
      }
    } else {
      renderSignedOut();
    }
  });
}

const APP_VERSION = "1.0.0";

const versionElement = document.querySelector("#app-version");
const connectionElement = document.querySelector("#connection-status");
const updateBanner = document.querySelector("#update-banner");
const updateButton = document.querySelector("#update-button");

versionElement.textContent = `v${APP_VERSION}`;

function updateConnectionStatus() {
  connectionElement.textContent = navigator.onLine ? "Conectado" : "Modo offline";
}

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
updateConnectionStatus();

let refreshingAfterUpdate = false;
let waitingWorker = null;

function showUpdate(worker) {
  waitingWorker = worker;
  updateBanner.hidden = false;
}

updateButton.addEventListener("click", () => {
  if (!waitingWorker) return;
  updateButton.disabled = true;
  updateButton.textContent = "Atualizando…";
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js", {
        scope: "./",
        updateViaCache: "none"
      });

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdate(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdate(installingWorker);
          }
        });
      });

      await registration.update();
    } catch (error) {
      console.error("Não foi possível registrar a atualização offline:", error);
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingAfterUpdate) return;
    refreshingAfterUpdate = true;
    window.location.reload();
  });
}

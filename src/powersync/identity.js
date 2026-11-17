export const OWNER_KEY = "estudos-ava-owner";
export const GUEST_KEY = "estudos-ava-guest-v2";
export const USER_KEY_PREFIX = "estudos-ava-v2:user:";

export function emptySnapshot() {
  return { schemaVersion: 2, courses: [], cards: [], resources: [] };
}

export function userSnapshotKey(userId) {
  return USER_KEY_PREFIX + encodeURIComponent(userId);
}

export function parseSnapshot(value) {
  try {
    const snapshot = typeof value === "string" ? JSON.parse(value) : value;
    if (
      snapshot?.schemaVersion === 2 &&
      Array.isArray(snapshot.courses) &&
      Array.isArray(snapshot.cards) &&
      Array.isArray(snapshot.resources)
    ) return snapshot;
  } catch {
    // Invalid or incomplete local data is never trusted as an account snapshot.
  }
  return null;
}

function hasData(snapshot) {
  return Boolean(snapshot?.courses?.length || snapshot?.cards?.length || snapshot?.resources?.length);
}

export function saveUserSnapshot(storage, userId, snapshot) {
  if (!userId || !parseSnapshot(snapshot)) return;
  storage.setItem(userSnapshotKey(userId), JSON.stringify(snapshot));
}

export function preserveWorkspace(storage, snapshot, currentUserId = null) {
  const ownerId = currentUserId || storage.getItem(OWNER_KEY);
  if (ownerId) {
    saveUserSnapshot(storage, ownerId, snapshot);
  } else if (parseSnapshot(snapshot) && hasData(snapshot)) {
    storage.setItem(GUEST_KEY, JSON.stringify(snapshot));
  }
  storage.removeItem(OWNER_KEY);
  return ownerId;
}

export function loadUserSnapshot(storage, userId) {
  return parseSnapshot(storage.getItem(userSnapshotKey(userId))) || emptySnapshot();
}

export function loadGuestSnapshot(storage) {
  return parseSnapshot(storage.getItem(GUEST_KEY)) || emptySnapshot();
}

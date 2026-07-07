import { getJson, setJson, remove } from "./storage.js";

const PREFIX = "kcl-offline-draft:";

export function saveDraft(key, payload) {
  setJson(PREFIX + key, { payload, savedAt: new Date().toISOString() });
}

export function loadDraft(key) {
  return getJson(PREFIX + key);
}

export function clearDraft(key) {
  remove(PREFIX + key);
}

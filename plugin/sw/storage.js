// Storage utilities for MV3 service worker

export function storageSyncGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

export function storageLocalGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

export function storageLocalSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

export function loadServerCreds() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { server: "", serverInitialized: false },
      resolve
    );
  });
}


const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

function createPasswordStore({ app, logDebug }) {
  const storePath = path.join(app.getPath('userData'), 'passwords.json');
  let cache = null;

  function isAvailable() {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch (err) {
      return false;
    }
  }

  function log(...args) {
    if (typeof logDebug === 'function') {
      logDebug('[passwordStore]', ...args);
    }
  }

  function loadStore() {
    if (cache) return;
    try {
      if (!fs.existsSync(storePath)) {
        cache = { version: 1, entries: {} };
        return;
      }
      const raw = fs.readFileSync(storePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
        cache = { version: 1, entries: {} };
        return;
      }
      cache = { version: 1, entries: { ...parsed.entries } };
    } catch (err) {
      log('failed to load store', err.message);
      cache = { version: 1, entries: {} };
    }
  }

  function saveStore() {
    if (!cache) return;
    try {
      fs.writeFileSync(storePath, JSON.stringify(cache, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      log('failed to save store', err.message);
    }
  }

  function getPassword(key) {
    if (!key || !isAvailable()) return null;
    loadStore();
    const entry = cache.entries[key];
    if (!entry || !entry.value) return null;
    try {
      const buffer = Buffer.from(entry.value, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (err) {
      log('failed to decrypt entry', key);
      delete cache.entries[key];
      saveStore();
      return null;
    }
  }

  function setPassword(key, password) {
    if (!key || password == null || !isAvailable()) return false;
    loadStore();
    try {
      const encrypted = safeStorage.encryptString(String(password));
      cache.entries[key] = {
        value: encrypted.toString('base64'),
        updatedAt: Date.now()
      };
      saveStore();
      return true;
    } catch (err) {
      log('failed to encrypt entry', key);
      return false;
    }
  }

  function deletePassword(key) {
    if (!key || !isAvailable()) return false;
    loadStore();
    if (cache.entries[key]) {
      delete cache.entries[key];
      saveStore();
    }
    return true;
  }

  return {
    isAvailable,
    getPassword,
    setPassword,
    deletePassword
  };
}

module.exports = {
  createPasswordStore
};

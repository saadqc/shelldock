const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_SETTINGS } = require('../constants');

function settingsPath() {
  return path.join(os.homedir(), '.shelldock', 'settings.json');
}

function mergeSettings(base, override) {
  if (!override || typeof override !== 'object') {
    return base;
  }
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeSettings(base[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return mergeSettings(DEFAULT_SETTINGS, parsed);
  } catch (err) {
    return mergeSettings(DEFAULT_SETTINGS, {});
  }
}

function saveSettings(nextSettings) {
  const merged = mergeSettings(DEFAULT_SETTINGS, nextSettings);
  try {
    const dir = path.dirname(settingsPath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  } catch (err) {
  }
  return merged;
}

module.exports = {
  loadSettings,
  saveSettings,
  settingsPath,
  mergeSettings
};

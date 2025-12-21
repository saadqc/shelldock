import { parseShortcut } from '../utils.js';

export function createSettingsService(state) {
  function readSettingValue(category, subcategory, field, fallback) {
    const node = state.appSettings && state.appSettings[category] && state.appSettings[category][subcategory]
      ? state.appSettings[category][subcategory][field]
      : null;
    if (node && Object.prototype.hasOwnProperty.call(node, 'value')) {
      return node.value;
    }
    return fallback;
  }

  function readSettingList(category, subcategory, field) {
    const value = readSettingValue(category, subcategory, field, []);
    return Array.isArray(value) ? value : [];
  }

  function shouldRestoreTabs() {
    return Boolean(readSettingValue('ui', 'session', 'restoreTabs', false));
  }

  function applySettings(options = {}) {
    const pageSize = Number(readSettingValue('ui', 'tree', 'pageSize', 500));
    if (!Number.isNaN(pageSize)) {
      state.treePageSize = Math.max(100, Math.min(2000, pageSize));
    }
    if (options.onTreeUpdate) {
      options.onTreeUpdate();
    }
    const restoreTabs = shouldRestoreTabs();
    if (options.reconcileTabs && !restoreTabs && typeof options.onReconcileTabs === 'function') {
      options.onReconcileTabs();
    }
  }

  function getEditorSettings() {
    return {
      mode: readSettingValue('editor', 'open', 'mode', 'remote-shell'),
      commandTemplate: readSettingValue('editor', 'open', 'commandTemplate', 'nano {escapedPath}'),
      localCommandTemplate: readSettingValue('editor', 'open', 'localCommandTemplate', 'code --reuse-window {path}'),
      sftpUriTemplate: readSettingValue('editor', 'open', 'sftpUriTemplate', 'sftp://{user}@{host}:{port}{path}'),
      associations: readSettingList('editor', 'associations', 'list')
    };
  }

  function getShortcutBindings() {
    const isMac = navigator.platform && navigator.platform.toLowerCase().includes('mac');
    const newTab = readSettingValue('ui', 'shortcuts', 'newTab', 'mod+t');
    const closeTab = readSettingValue('ui', 'shortcuts', 'closeTab', 'mod+w');
    return {
      newTab: parseShortcut(newTab, isMac),
      closeTab: parseShortcut(closeTab, isMac)
    };
  }

  function shouldAutoConnectOnSelect() {
    return Boolean(readSettingValue('ui', 'connection', 'autoConnectOnSelect', false));
  }

  return {
    readSettingValue,
    readSettingList,
    applySettings,
    shouldRestoreTabs,
    getEditorSettings,
    getShortcutBindings,
    shouldAutoConnectOnSelect
  };
}

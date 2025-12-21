import { getActiveTab } from '../state.js';

export function createPersistenceService(state, settingsService) {
  function getHostState(map, host) {
    if (!map || !host) {
      return [];
    }
    return Array.isArray(map[host]) ? map[host] : [];
  }

  function updateHostState(key, host, list) {
    if (!state.appState || !host) {
      return;
    }
    const nextMap = { ...(state.appState[key] || {}) };
    nextMap[host] = list;
    state.appState = { ...state.appState, [key]: nextMap };
    state.api.updateState({ [key]: nextMap });
  }

  function persistTabs(options = {}) {
    if (!state.appState || !state.api) {
      return;
    }
    const restoreTabs = settingsService.shouldRestoreTabs();
    if (!restoreTabs || options.forceClear) {
      if ((state.appState.tabs && state.appState.tabs.length) || state.appState.activeTabId) {
        state.appState = { ...state.appState, tabs: [], activeTabId: '' };
        state.api.updateState({ tabs: [], activeTabId: '' });
      }
      return;
    }
    const serialized = Array.from(state.tabs.values()).map((tab) => ({
      id: tab.id,
      host: tab.host || '',
      currentPath: tab.currentPath || '/',
      treeRootPath: tab.treeRootPath || '/',
      connected: Boolean(tab.connected)
    }));
    const activeId = state.activeTabId || (serialized[0] && serialized[0].id) || '';
    state.appState = { ...state.appState, tabs: serialized, activeTabId: activeId };
    state.api.updateState({ tabs: serialized, activeTabId: activeId });
  }

  function getDefaultHost(hostConfigs, hostSelect, lastHost) {
    if (lastHost && hostConfigs.has(lastHost)) {
      return lastHost;
    }
    const first = hostSelect && hostSelect.options.length > 0 ? hostSelect.options[0] : null;
    return first ? first.value : '';
  }

  function setStatus(text, isError, tab = getActiveTab(state)) {
    if (!tab) return;
    tab.statusMessage = text;
    tab.statusIsError = Boolean(isError);
    const statusLabel = state.elements.statusLabel;
    if (tab.id === state.activeTabId && statusLabel) {
      statusLabel.textContent = text;
      statusLabel.classList.toggle('error', Boolean(isError));
    }
  }

  return {
    getHostState,
    updateHostState,
    persistTabs,
    getDefaultHost,
    setStatus
  };
}

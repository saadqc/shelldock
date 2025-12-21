import { DEFAULT_TREE_PAGE_SIZE } from './constants.js';

export function createState(api, elements) {
  return {
    api,
    elements,
    tabs: new Map(),
    activeTabId: null,
    appState: null,
    appSettings: null,
    hostConfigs: new Map(),
    treePageSize: DEFAULT_TREE_PAGE_SIZE,
    shortcutBindings: {},
    sectionState: {
      tree: true,
      saved: true,
      recent: true
    }
  };
}

export function getActiveTab(state) {
  return state.activeTabId ? state.tabs.get(state.activeTabId) : null;
}

export function getTab(state, tabId) {
  return tabId ? state.tabs.get(tabId) : null;
}

import { createState } from './state.js';
import { createSettingsService } from './services/settingsService.js';
import { createPersistenceService } from './services/persistenceService.js';
import { createEditorService } from './services/editorService.js';
import { createFilesPanel } from './components/filesPanel.js';
import { createActionsPanel } from './components/actionsPanel.js';
import { createSessionTabs } from './components/sessionTabs.js';
import { createPasswordPrompt } from './components/passwordPrompt.js';
import { matchesShortcutEvent } from './utils.js';

const api = window.api;
const preloadReady = window.preloadReady;

const elements = {
  hostSelect: document.getElementById('host-select'),
  connectButton: document.getElementById('connect-btn'),
  statusLabel: document.getElementById('status'),
  fileTree: document.getElementById('file-tree'),
  commandsList: document.getElementById('commands'),
  transferStatus: document.getElementById('transfer-status'),
  tabButtons: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  sectionHeaders: document.querySelectorAll('.section-header'),
  sessionTabs: document.getElementById('session-tabs'),
  newTabButton: document.getElementById('new-tab-btn'),
  terminalStack: document.getElementById('terminal-stack'),
  uploadInput: document.getElementById('upload-file'),
  uploadRemoteInput: document.getElementById('upload-remote'),
  uploadButton: document.getElementById('upload-btn'),
  downloadRemoteInput: document.getElementById('download-remote'),
  downloadButton: document.getElementById('download-btn'),
  commandNameInput: document.getElementById('command-name'),
  commandCwdInput: document.getElementById('command-cwd'),
  commandCommandInput: document.getElementById('command-command'),
  commandSaveButton: document.getElementById('command-save-btn'),
  commandCancelButton: document.getElementById('command-cancel-btn'),
  backButton: document.getElementById('back-btn'),
  forwardButton: document.getElementById('forward-btn'),
  pathInput: document.getElementById('path-input'),
  pathGoButton: document.getElementById('path-go-btn'),
  pathSaveButton: document.getElementById('path-save-btn'),
  savedPaths: document.getElementById('saved-paths'),
  recentPaths: document.getElementById('recent-paths')
};

const state = createState(api, elements);
const settingsService = createSettingsService(state);
const persistenceService = createPersistenceService(state, settingsService);
const editorBridge = { openFile: async () => {} };
const actionsBridge = {
  createTransferRow: () => null,
  markTransferComplete: () => {},
  updateTransferRowForTab: () => {}
};
const filesPanel = createFilesPanel(state, persistenceService, editorBridge, actionsBridge);
const actionsPanel = createActionsPanel(state, persistenceService, filesPanel);
const editorService = createEditorService(state, settingsService, actionsPanel, persistenceService);
editorBridge.openFile = editorService.openFile;
actionsBridge.createTransferRow = actionsPanel.createTransferRow;
actionsBridge.markTransferComplete = actionsPanel.markTransferComplete;
actionsBridge.updateTransferRowForTab = actionsPanel.updateTransferRowForTab;
const sessionTabs = createSessionTabs(state, persistenceService, filesPanel, actionsPanel, settingsService);
createPasswordPrompt(state);

function reportInitError(error) {
  if (!elements.statusLabel) return;
  const message = error && error.message ? error.message : String(error);
  elements.statusLabel.textContent = `Init error: ${message}`;
  elements.statusLabel.classList.add('error');
}

window.addEventListener('error', (event) => {
  reportInitError(event.error || event.message || 'Unknown error');
});

window.addEventListener('unhandledrejection', (event) => {
  reportInitError(event.reason || 'Unhandled promise rejection');
});

window.addEventListener('focus', async () => {
  if (!api) return;
  try {
    const settings = await api.getSettings();
    if (settings) {
      state.appSettings = settings;
      settingsService.applySettings({
        reconcileTabs: true,
        onReconcileTabs: () => persistenceService.persistTabs({ forceClear: true }),
        onTreeUpdate: () => filesPanel.renderTree()
      });
      state.shortcutBindings = settingsService.getShortcutBindings();
    }
  } catch (err) {
  }
});

if (elements.statusLabel) {
  elements.statusLabel.textContent = 'Renderer starting...';
  elements.statusLabel.classList.remove('error');
}

if (!window.Terminal || !window.FitAddon) {
  reportInitError('xterm failed to load');
}

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  const bindings = state.shortcutBindings || {};
  if (matchesShortcutEvent(event, bindings.newTab)) {
    event.preventDefault();
    sessionTabs.createNewTab();
    return;
  }
  if (matchesShortcutEvent(event, bindings.closeTab)) {
    event.preventDefault();
    sessionTabs.closeActiveTab();
  }
});

(async function init() {
  if (!api) {
    reportInitError('IPC unavailable');
    return;
  }
  if (!preloadReady) {
    reportInitError('Preload did not run');
    return;
  }
  try {
    persistenceService.setStatus('Loading SSH hosts...');
    const stateResult = await api.getState();
    const settings = await api.getSettings();
    state.appState = {
      knownHosts: [],
      lastHost: '',
      recentLocations: {},
      savedLocations: {},
      commands: [],
      tabs: [],
      activeTabId: '',
      ...(stateResult || {})
    };
    state.appSettings = settings || {};

    settingsService.applySettings({
      reconcileTabs: true,
      onReconcileTabs: () => persistenceService.persistTabs({ forceClear: true })
    });
    state.shortcutBindings = settingsService.getShortcutBindings();

    await sessionTabs.refreshHosts();
    actionsPanel.renderCommands(state.appState ? state.appState.commands : []);
    Object.keys(state.sectionState).forEach((key) => filesPanel.updateSectionUI(key));
    sessionTabs.setupTerminalHandlers();

    const restore = settingsService.shouldRestoreTabs();
    const savedTabs = restore && Array.isArray(state.appState.tabs) ? state.appState.tabs : [];
    const reconnectQueue = [];

    if (savedTabs.length) {
      for (const saved of savedTabs) {
        const tab = sessionTabs.createTabState(saved);
        if (saved.connected && saved.host) {
          reconnectQueue.push({ tab, host: saved.host, path: saved.currentPath || '/' });
        }
      }
      const desiredActive = state.appState.activeTabId && state.tabs.has(state.appState.activeTabId)
        ? state.appState.activeTabId
        : state.tabs.keys().next().value;
      if (desiredActive) {
        sessionTabs.setActiveSessionTab(desiredActive, { skipPersist: true });
      }
    } else {
      const tab = sessionTabs.createTabState({ host: persistenceService.getDefaultHost(state.hostConfigs, elements.hostSelect, state.appState.lastHost) });
      sessionTabs.setActiveSessionTab(tab.id, { skipPersist: true });
      if (state.appState.lastHost && !tab.host) {
        tab.host = state.appState.lastHost;
      }
    }

    for (const item of reconnectQueue) {
      sessionTabs.connectTab(item.tab, item.host, { restorePath: item.path });
    }

    filesPanel.updateNavButtons();
  } catch (err) {
    reportInitError(err);
  }
})();

import { getActiveTab, getTab } from '../state.js';
import { buildRemoteCdCommand, formatRemotePath } from '../utils.js';
import { LOCAL_HOST_VALUE, LOCAL_HOST_LABEL } from '../constants.js';

export function createSessionTabs(state, persistenceService, filesPanel, actionsPanel, settingsService) {
  const {
    hostSelect,
    connectButton,
    statusLabel,
    sessionTabs,
    newTabButton,
    terminalStack,
    tabButtons,
    tabPanels
  } = state.elements;

  const TerminalCtor = window.Terminal;
  const FitAddonCtor = window.FitAddon && (window.FitAddon.FitAddon || window.FitAddon);

  const tabContextMenu = document.createElement('div');
  tabContextMenu.className = 'context-menu';
  document.body.appendChild(tabContextMenu);

  const terminalContextMenu = document.createElement('div');
  terminalContextMenu.className = 'context-menu';
  document.body.appendChild(terminalContextMenu);

  function hideTabContextMenu() {
    tabContextMenu.classList.remove('open');
    tabContextMenu.innerHTML = '';
  }

  function hideTerminalContextMenu() {
    terminalContextMenu.classList.remove('open');
    terminalContextMenu.innerHTML = '';
  }

  function showTabContextMenu(x, y, tabId) {
    tabContextMenu.innerHTML = '';
    const duplicateButton = document.createElement('button');
    duplicateButton.type = 'button';
    duplicateButton.textContent = 'Duplicate tab';
    duplicateButton.addEventListener('click', () => {
      duplicateTab(tabId);
      hideTabContextMenu();
    });
    tabContextMenu.appendChild(duplicateButton);
    tabContextMenu.style.left = `${x}px`;
    tabContextMenu.style.top = `${y}px`;
    tabContextMenu.classList.add('open');
  }

  function showTerminalContextMenu(x, y, tabId) {
    terminalContextMenu.innerHTML = '';
    const tab = state.tabs.get(tabId);
    const killButton = document.createElement('button');
    killButton.type = 'button';
    killButton.textContent = 'Kill terminal';
    if (!tab || !tab.connected) {
      killButton.disabled = true;
    }
    killButton.addEventListener('click', () => {
      if (state.api && typeof state.api.kill === 'function') {
        state.api.kill(tabId);
      }
      hideTerminalContextMenu();
    });
    terminalContextMenu.appendChild(killButton);
    terminalContextMenu.style.left = `${x}px`;
    terminalContextMenu.style.top = `${y}px`;
    terminalContextMenu.classList.add('open');
  }

  document.addEventListener('click', () => {
    hideTabContextMenu();
    hideTerminalContextMenu();
  });
  window.addEventListener('blur', () => {
    hideTabContextMenu();
    hideTerminalContextMenu();
  });

  function ensureHostOption(host) {
    if (!hostSelect || !host) return;
    const exists = Array.from(hostSelect.options).some((option) => option.value === host);
    if (!exists) {
      const option = document.createElement('option');
      option.value = host;
      option.textContent = host;
      hostSelect.appendChild(option);
    }
  }

  function setTabHost(tab, host) {
    if (!tab) return;
    tab.host = host || '';
    tab.sessionType = host === LOCAL_HOST_VALUE ? 'local' : 'ssh';
    tab.remotePathStyle = 'posix';
    if (state.appState && host) {
      state.appState = { ...state.appState, lastHost: host };
      state.api.updateState({ lastHost: host });
    }
    renderSessionTabs();
    if (tab.id === state.activeTabId) {
      ensureHostOption(tab.host);
      hostSelect.value = tab.host;
    }
    persistenceService.persistTabs();
  }

  function renderSessionTabs() {
    if (!sessionTabs) return;
    sessionTabs.innerHTML = '';
    for (const tab of state.tabs.values()) {
      const button = document.createElement('button');
      button.className = 'session-tab';
      button.classList.toggle('active', tab.id === state.activeTabId);
      const label = tab.sessionType === 'local'
        ? 'local'
        : (tab.host ? `ssh:${tab.host}` : 'ssh:new');
      button.textContent = label;
      button.title = label;

      const closeBtn = document.createElement('span');
      closeBtn.className = 'close-btn';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeTab(tab.id);
      });
      button.appendChild(closeBtn);

      button.addEventListener('click', () => {
        setActiveSessionTab(tab.id);
      });
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showTabContextMenu(event.clientX, event.clientY, tab.id);
      });
      sessionTabs.appendChild(button);
    }
  }

  function setActiveSessionTab(tabId, options = {}) {
    if (!state.tabs.has(tabId)) {
      return;
    }
    state.activeTabId = tabId;
    state.tabs.forEach((tab) => {
      tab.container.classList.toggle('active', tab.id === tabId);
    });
    renderSessionTabs();
    syncUiToActiveTab();
    fitActiveTerminal();
    if (!options.skipPersist) {
      persistenceService.persistTabs();
    }
  }

  function fitActiveTerminal() {
    const tab = getActiveTab(state);
    if (!tab) return;
    tab.fitAddon.fit();
    state.api.resize(tab.id, tab.term.cols, tab.term.rows);
  }

  function updateConnectUi(tab) {
    const connected = tab ? tab.connected : false;
    connectButton.textContent = connected ? 'Disconnect' : 'Connect';
    hostSelect.disabled = connected;
    if (state.elements.pathInput) state.elements.pathInput.disabled = !connected;
    if (state.elements.pathGoButton) state.elements.pathGoButton.disabled = !connected;
    if (state.elements.pathSaveButton) state.elements.pathSaveButton.disabled = !connected;
    if (state.elements.backButton) state.elements.backButton.disabled = !connected;
    if (state.elements.forwardButton) state.elements.forwardButton.disabled = !connected;
  }

  function syncUiToActiveTab() {
    const tab = getActiveTab(state);
    if (!tab) {
      return;
    }
    ensureHostOption(tab.host);
    hostSelect.value = tab.host || hostSelect.value;
    if (!tab.host) {
      tab.host = hostSelect.value || '';
    }
    if (state.elements.pathInput) {
      state.elements.pathInput.value = formatRemotePath(tab.currentPath, tab.remotePathStyle);
    }
    updateConnectUi(tab);
    filesPanel.renderSavedLocations();
    filesPanel.renderRecentLocations();
    actionsPanel.renderTransfers();
    filesPanel.updateNavButtons();

    const defaultMessage = tab.connected
      ? (tab.sessionType === 'local' ? 'Connected to local shell' : `Connected to ${tab.host}`)
      : 'Disconnected';
    const message = tab.statusMessage || defaultMessage;
    if (statusLabel) {
      statusLabel.textContent = message;
      statusLabel.classList.toggle('error', Boolean(tab.statusIsError));
    }

    filesPanel.renderTree();
    filesPanel.ensureTreeLoaded(tab);
  }

  function closeTab(tabId) {
    const tab = state.tabs.get(tabId);
    if (!tab) return;
    if (tab.isBusy) {
      const proceed = window.confirm('A command is still running in this tab. Close anyway?');
      if (!proceed) {
        return;
      }
    }
    if (tab.connected) {
      state.api.disconnect(tabId);
    }
    tab.term.dispose();
    tab.container.remove();
    state.tabs.delete(tabId);
    if (state.activeTabId === tabId) {
      const next = state.tabs.keys().next().value || null;
      if (next) {
        setActiveSessionTab(next);
      } else {
        const newTab = createTabState({ host: persistenceService.getDefaultHost(state.hostConfigs, hostSelect, state.appState.lastHost) });
        setActiveSessionTab(newTab.id);
      }
    } else {
      renderSessionTabs();
    }
    persistenceService.persistTabs();
  }

  function closeActiveTab() {
    const tab = getActiveTab(state);
    if (!tab) return;
    closeTab(tab.id);
  }

  function createTabState(initial = {}) {
    const id = initial.id || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const container = document.createElement('div');
    container.className = 'terminal-pane';
    container.dataset.tabId = id;
    terminalStack.appendChild(container);

    const term = new TerminalCtor({
      fontFamily: 'Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#0b0e14',
        foreground: '#e6e6e6'
      }
    });
    const fitAddon = new FitAddonCtor();
    term.loadAddon(fitAddon);
    term.open(container);

    container.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      hideTabContextMenu();
      showTerminalContextMenu(event.clientX, event.clientY, id);
    });

    const initialPath = initial.currentPath || '/';
    const inferredStyle = /^\/[A-Za-z]:/.test(initialPath) ? 'windows' : 'posix';
    const tabState = {
      id,
      host: initial.host || '',
      sessionType: initial.sessionType || (initial.host === LOCAL_HOST_VALUE ? 'local' : 'ssh'),
      connected: false,
      term,
      fitAddon,
      container,
      treeCache: new Map(),
      expandedDirs: new Set([initial.treeRootPath || initial.currentPath || '/']),
      treePages: new Map(),
      transferRows: new Map(),
      currentPath: initialPath,
      treeRootPath: initial.treeRootPath || initialPath || '/',
      navHistory: [],
      navIndex: -1,
      statusMessage: 'Disconnected',
      statusIsError: false,
      restoreConnected: Boolean(initial.connected),
      isBusy: false,
      treeRefreshTimer: null,
      remotePathStyle: inferredStyle
    };

    term.onData((data) => {
      if (tabState.connected) {
        if (data.includes('\r') || data.includes('\n')) {
          tabState.isBusy = true;
        }
        state.api.write(tabState.id, data);
      }
    });

    const isMac = navigator.platform && navigator.platform.toLowerCase().includes('mac');
    term.attachCustomKeyEventHandler((event) => {
      const key = event.key ? event.key.toLowerCase() : '';
      const hasModifier = isMac ? event.metaKey : event.ctrlKey;
      if (hasModifier && key === 'c') {
        const selection = term.getSelection();
        if (selection) {
          state.api.copyToClipboard(selection);
          return false;
        }
        return true;
      }
      if (hasModifier && key === 'v') {
        if (tabState.connected) {
          state.api.readClipboard().then((text) => {
            if (text) {
              state.api.write(tabState.id, text);
            }
          });
        }
        return false;
      }
      return true;
    });

    state.tabs.set(id, tabState);
    return tabState;
  }

  function createNewTab(options = {}) {
    const lastHost = state.appState ? state.appState.lastHost : '';
    const host = options.host || persistenceService.getDefaultHost(state.hostConfigs, hostSelect, lastHost);
    const tab = createTabState({
      host,
      currentPath: options.path || '/',
      treeRootPath: options.path || '/'
    });
    setActiveSessionTab(tab.id);
    if (options.connect && host) {
      connectTab(tab, host, { restorePath: options.path || tab.currentPath || '/' });
    }
    persistenceService.persistTabs();
    return tab;
  }

  function duplicateTab(tabId) {
    const source = state.tabs.get(tabId);
    if (!source) return;
    const host = source.host || persistenceService.getDefaultHost(state.hostConfigs, hostSelect, state.appState.lastHost);
    const path = source.currentPath || '/';
    createNewTab({ host, path, connect: source.connected });
  }

  function setSidebarTab(name) {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === name;
      button.classList.toggle('active', isActive);
    });
    tabPanels.forEach((panel) => {
      const isActive = panel.id === `tab-${name}`;
      panel.classList.toggle('active', isActive);
    });
  }

  async function refreshHosts() {
    try {
      const hosts = await state.api.getHosts();
      hostSelect.innerHTML = '';
      state.hostConfigs.clear();
      const localOption = document.createElement('option');
      localOption.value = LOCAL_HOST_VALUE;
      localOption.textContent = LOCAL_HOST_LABEL;
      hostSelect.appendChild(localOption);
      state.hostConfigs.set(LOCAL_HOST_VALUE, { alias: LOCAL_HOST_LABEL, type: 'local' });
      if (hosts && hosts.length) {
        for (const host of hosts) {
          const option = document.createElement('option');
          option.value = host.alias;
          option.textContent = host.alias;
          hostSelect.appendChild(option);
          state.hostConfigs.set(host.alias, host);
        }
      }
      const tab = getActiveTab(state);
      if (tab && tab.host) {
        ensureHostOption(tab.host);
        hostSelect.value = tab.host;
      } else if (hostSelect.options.length) {
        hostSelect.value = persistenceService.getDefaultHost(state.hostConfigs, hostSelect, state.appState.lastHost);
      }
      const statusTab = getActiveTab(state);
      if (statusTab && statusTab.statusMessage === 'Disconnected') {
        const count = hosts ? hosts.length : 0;
        persistenceService.setStatus(`Loaded ${count} SSH hosts`, false, statusTab);
      }
    } catch (err) {
      hostSelect.innerHTML = '';
      const localOption = document.createElement('option');
      localOption.value = LOCAL_HOST_VALUE;
      localOption.textContent = LOCAL_HOST_LABEL;
      hostSelect.appendChild(localOption);
      state.hostConfigs.clear();
      state.hostConfigs.set(LOCAL_HOST_VALUE, { alias: LOCAL_HOST_LABEL, type: 'local' });
      const tab = getActiveTab(state);
      persistenceService.setStatus('Failed to read ~/.ssh/config', true, tab);
    }
  }

  function setupTerminalHandlers() {
    if (!state.api) {
      return;
    }

    state.api.onSshData((payload) => {
      const tab = getTab(state, payload.tabId);
      if (!tab) return;
      tab.term.write(payload.data);
    });

    state.api.onSshCwd((payload) => {
      const tab = getTab(state, payload.tabId);
      if (!tab || !payload.cwd) return;
      const cwdValue = String(payload.cwd);
      const looksWindows = /^[A-Za-z]:[\\/]/.test(cwdValue) || /^\/[A-Za-z]:/.test(cwdValue);
      if (looksWindows && tab.remotePathStyle !== 'windows') {
        tab.remotePathStyle = 'windows';
      }
      filesPanel.updateTabPath(tab, payload.cwd, {
        pushNav: true,
        recordRecent: true,
        clearCache: true,
        force: true
      });
    });

    state.api.onSshExit((payload) => {
      const tab = getTab(state, payload.tabId);
      if (!tab) return;
      setConnectedForTab(tab, false);
      tab.isBusy = false;
      persistenceService.setStatus('Disconnected', true, tab);
      filesPanel.resetTreeForTab(tab, true);
      if (tab.id === state.activeTabId) {
        filesPanel.renderTree();
      }
    });

    state.api.onSshPrompt((payload) => {
      const tab = getTab(state, payload.tabId);
      if (!tab) return;
      tab.isBusy = false;
    });

    state.api.onSftpProgress((payload) => {
      if (!payload) return;
      actionsPanel.updateTransferRowForTab(payload.tabId, payload.transferred, payload.total, payload.id);
    });

    const resizeObserver = new ResizeObserver(() => {
      fitActiveTerminal();
    });
    resizeObserver.observe(terminalStack);
  }

  async function connectTab(tab, host, options = {}) {
    if (!state.api) {
      persistenceService.setStatus('IPC unavailable', true, tab);
      return false;
    }
    if (!host) {
      persistenceService.setStatus('No host selected', true, tab);
      return false;
    }

    tab.sessionType = host === LOCAL_HOST_VALUE ? 'local' : 'ssh';
    const label = tab.sessionType === 'local' ? 'local shell' : host;
    persistenceService.setStatus(`Connecting to ${label}...`, false, tab);
    const result = await state.api.connect(tab.id, host);
    if (!result || !result.ok) {
      persistenceService.setStatus(result && result.error ? result.error : 'Connection failed', true, tab);
      setConnectedForTab(tab, false);
      return false;
    }

    setConnectedForTab(tab, true);
    setTabHost(tab, host);
    persistenceService.setStatus(`Connected to ${label}`, false, tab);

    tab.navHistory = [];
    tab.navIndex = -1;
    tab.isBusy = false;

    const targetPath = options.path || tab.currentPath || '/';
    if (options.restorePath) {
      filesPanel.updateTabPath(tab, options.restorePath, { pushNav: true, recordRecent: false, clearCache: true, force: true });
      const cdCommand = buildRemoteCdCommand(options.restorePath, { pathStyle: tab.remotePathStyle });
      state.api.write(tab.id, `${cdCommand}\n`);
    } else {
      filesPanel.updateTabPath(tab, targetPath, { pushNav: true, recordRecent: false, clearCache: true, force: true });
    }

    if (tab.id === state.activeTabId) {
      fitActiveTerminal();
    }

    return true;
  }

  async function disconnectTab(tab) {
    if (!state.api) {
      persistenceService.setStatus('IPC unavailable', true, tab);
      return;
    }
    await state.api.disconnect(tab.id);
    setConnectedForTab(tab, false);
    persistenceService.setStatus('Disconnected', false, tab);
    filesPanel.resetTreeForTab(tab, true);
    if (tab.id === state.activeTabId) {
      filesPanel.renderTree();
    }
  }

  function setConnectedForTab(tab, next) {
    if (!tab) return;
    tab.connected = next;
    if (tab.id === state.activeTabId) {
      updateConnectUi(tab);
    }
    persistenceService.persistTabs();
  }

  function bindEvents() {
    connectButton.addEventListener('click', async () => {
      const tab = getActiveTab(state);
      if (!tab) return;
      if (tab.connected) {
        await disconnectTab(tab);
      } else {
        await connectTab(tab, hostSelect.value || tab.host || persistenceService.getDefaultHost(state.hostConfigs, hostSelect, state.appState.lastHost));
      }
    });

    if (newTabButton) {
      newTabButton.addEventListener('click', () => {
        createNewTab();
      });
    }

    hostSelect.addEventListener('change', () => {
      const tab = getActiveTab(state);
      if (!tab || tab.connected) {
        return;
      }
      const nextHost = hostSelect.value;
      setTabHost(tab, nextHost);
      if (settingsService && settingsService.shouldAutoConnectOnSelect()) {
        connectTab(tab, nextHost);
      }
    });

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setSidebarTab(button.dataset.tab);
      });
    });
  }

  bindEvents();

  return {
    refreshHosts,
    setupTerminalHandlers,
    createTabState,
    setActiveSessionTab,
    connectTab,
    disconnectTab,
    renderSessionTabs,
    syncUiToActiveTab,
    createNewTab,
    closeActiveTab,
    duplicateTab
  };
}

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { ICON_PATH, LOCAL_HOST_VALUE } = require('./constants');
const { loadState, saveState } = require('./services/stateStore');
const { loadSettings, saveSettings } = require('./services/settingsStore');
const { listConfigHosts, resolveHost } = require('./services/sshConfig');
const { createSessionManager } = require('./services/sessionManager');
const { createPasswordStore } = require('./services/passwordStore');

app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch(
  'disable-features',
  'AutofillServerCommunication,AutofillAddressServerCommunication,AutofillCreditCardUpload'
);

let mainWindow = null;
let settingsWindow = null;
let state = null;
let settings = null;
let passwordStore = null;
const pendingPasswordRequests = new Map();
let passwordRequestCounter = 0;

function logDebug(...args) {
  if (process.env.SHELLDOCK_DEBUG) {
    console.log('[shelldock]', ...args);
  }
}

function buildHostLabel(hostConfig) {
  if (!hostConfig) return '';
  const host = hostConfig.hostName || hostConfig.alias || '';
  const user = hostConfig.user || process.env.USER || '';
  const port = hostConfig.port ? Number(hostConfig.port) : 22;
  const base = user ? `${user}@${host}` : host;
  return port && port !== 22 ? `${base}:${port}` : base;
}

function flushPasswordRequests() {
  for (const resolve of pendingPasswordRequests.values()) {
    resolve({ action: 'cancel' });
  }
  pendingPasswordRequests.clear();
}

function requestPassword(payload) {
  if (!mainWindow) {
    return Promise.resolve(null);
  }
  const requestId = `pw-${Date.now()}-${passwordRequestCounter += 1}`;
  const hostConfig = payload && payload.hostConfig ? payload.hostConfig : null;
  const message = payload && payload.error ? String(payload.error) : '';
  const promptPayload = {
    requestId,
    tabId: payload && payload.tabId ? payload.tabId : null,
    hostAlias: hostConfig && hostConfig.alias ? hostConfig.alias : '',
    hostLabel: buildHostLabel(hostConfig),
    attempt: payload && payload.attempt ? payload.attempt : 1,
    maxAttempts: payload && payload.maxAttempts ? payload.maxAttempts : 1,
    reason: payload && payload.reason ? payload.reason : 'ssh',
    error: message,
    rememberAvailable: passwordStore ? passwordStore.isAvailable() : false
  };

  return new Promise((resolve) => {
    pendingPasswordRequests.set(requestId, resolve);
    mainWindow.webContents.send('ssh:password-request', promptPayload);
  });
}

const sessionManager = createSessionManager({
  sendToRenderer: (channel, payload) => {
    if (mainWindow) {
      mainWindow.webContents.send(channel, payload);
    }
  },
  logDebug,
  getSettings: () => settings,
  requestPassword,
  passwordStore: {
    isAvailable: () => (passwordStore ? passwordStore.isAvailable() : false),
    getPassword: (key) => (passwordStore ? passwordStore.getPassword(key) : null),
    setPassword: (key, password) => (passwordStore ? passwordStore.setPassword(key, password) : false),
    deletePassword: (key) => (passwordStore ? passwordStore.deletePassword(key) : false)
  }
});

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        {
          label: 'Settings',
          click: () => createSettingsWindow()
        },
        { type: 'separator' },
        { role: 'about' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
    flushPasswordRequests();
  });

  if (app.dock && fs.existsSync(ICON_PATH)) {
    try {
      app.dock.setIcon(ICON_PATH);
    } catch (err) {
    }
  }
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 640,
    height: 720,
    backgroundColor: '#0b0e14',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '..', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

app.whenReady().then(() => {
  state = loadState();
  settings = loadSettings();
  passwordStore = createPasswordStore({ app, logDebug });
  buildMenu();

  ipcMain.handle('app:get-state', () => state);
  ipcMain.handle('app:update-state', (event, patch) => {
    if (!patch || typeof patch !== 'object') {
      return state;
    }
    state = saveState(state, patch);
    return state;
  });

  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:update', (event, patch) => {
    if (!patch || typeof patch !== 'object') {
      return settings;
    }
    settings = saveSettings(patch);
    return settings;
  });

  ipcMain.handle('ssh:hosts', () => listConfigHosts(logDebug));

  ipcMain.handle('ssh:connect', async (event, payload) => {
    const host = payload && payload.host ? payload.host : null;
    const tabId = payload && payload.tabId ? payload.tabId : null;
    if (!tabId) {
      return { ok: false, error: 'Missing tab id' };
    }
    if (!host) {
      return { ok: false, error: 'No host selected' };
    }
    if (host === LOCAL_HOST_VALUE) {
      try {
        await sessionManager.connectLocal(tabId);
        state = saveState(state, { lastHost: host });
        return { ok: true };
      } catch (err) {
        await sessionManager.disconnect(tabId);
        return { ok: false, error: err.message };
      }
    }
    const hostConfig = resolveHost(host, logDebug);
    if (!hostConfig) {
      return { ok: false, error: `Host not found in SSH config: ${host}` };
    }

    try {
      await sessionManager.connect(tabId, hostConfig);

      if (!state.knownHosts.includes(host)) {
        state.knownHosts.push(host);
      }
      state = saveState(state, { lastHost: host, knownHosts: state.knownHosts });

      return { ok: true };
    } catch (err) {
      await sessionManager.disconnect(tabId);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ssh:password-response', (event, payload) => {
    const requestId = payload && payload.requestId ? payload.requestId : null;
    if (!requestId || !pendingPasswordRequests.has(requestId)) {
      return { ok: false, error: 'Unknown password request' };
    }
    const resolve = pendingPasswordRequests.get(requestId);
    pendingPasswordRequests.delete(requestId);
    resolve({
      action: payload && payload.action === 'submit' ? 'submit' : 'cancel',
      password: payload && payload.password ? String(payload.password) : '',
      remember: Boolean(payload && payload.remember)
    });
    return { ok: true };
  });

  ipcMain.handle('ssh:disconnect', async (event, payload) => {
    const tabId = payload && payload.tabId ? payload.tabId : null;
    if (tabId) {
      await sessionManager.disconnect(tabId);
    }
    return { ok: true };
  });

  ipcMain.handle('ssh:kill', async (event, payload) => {
    const tabId = payload && payload.tabId ? payload.tabId : null;
    if (tabId) {
      await sessionManager.kill(tabId);
    }
    return { ok: true };
  });

  ipcMain.on('ssh:write', (event, payload) => {
    const tabId = payload && payload.tabId ? payload.tabId : null;
    const data = payload && payload.data ? payload.data : '';
    sessionManager.write(tabId, data);
  });

  ipcMain.on('ssh:resize', (event, payload) => {
    const tabId = payload && payload.tabId ? payload.tabId : null;
    const size = payload && payload.size ? payload.size : payload;
    sessionManager.resize(tabId, size && size.cols, size && size.rows);
  });

  ipcMain.handle('shell:open-external', async (event, target) => {
    if (!target) {
      return { ok: false, error: 'Missing target' };
    }
    await shell.openExternal(String(target));
    return { ok: true };
  });

  ipcMain.handle('clipboard:write', (event, text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  });

  ipcMain.handle('clipboard:read', () => clipboard.readText());

  ipcMain.handle('shell:exec', async (event, payload) => {
    const command = payload && payload.command ? String(payload.command) : '';
    if (!command) {
      return { ok: false, error: 'Missing command' };
    }
    const { spawn } = require('child_process');
    spawn(command, {
      shell: true,
      detached: true,
      stdio: 'ignore'
    }).unref();
    return { ok: true };
  });

  ipcMain.handle('sftp:list', async (event, payload) => {
    const tabId = payload && payload.tabId ? payload.tabId : null;
    const remotePath = payload && payload.path ? payload.path : '/';
    try {
      const list = await sessionManager.list(tabId, remotePath);
      return list;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('local:list', async (event, payload) => {
    const tabId = payload && payload.tabId ? payload.tabId : null;
    const localPath = payload && payload.path ? payload.path : '';
    try {
      const list = await sessionManager.listLocal(tabId, localPath);
      return list;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('sftp:download', async (event, payload) => {
    const tabId = payload && payload.tabId ? payload.tabId : null;
    const remotePath = payload && payload.remotePath ? payload.remotePath : null;
    if (!remotePath) {
      return { ok: false, error: 'Missing remote path' };
    }

    let localPath = payload.localPath || '';
    const shouldOpen = Boolean(payload.open);

    if (!localPath && !shouldOpen) {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.basename(remotePath)
      });
      if (result.canceled) {
        return { ok: false, error: 'Download canceled' };
      }
      localPath = result.filePath;
    }

    if (!localPath && shouldOpen) {
      const baseName = path.basename(remotePath);
      const timestamp = Date.now();
      localPath = path.join(os.tmpdir(), `${timestamp}-${baseName}`);
    }

    const transferId = payload.id || `download-${Date.now()}`;
    await sessionManager.download(tabId, remotePath, localPath, transferId);

    if (shouldOpen) {
      shell.openPath(localPath);
    }

    return { ok: true, localPath, id: transferId };
  });

  ipcMain.handle('sftp:upload', async (event, payload) => {
    const tabId = payload && payload.tabId ? payload.tabId : null;
    const localPath = payload && payload.localPath ? payload.localPath : null;
    const remotePath = payload && payload.remotePath ? payload.remotePath : null;
    if (!localPath || !remotePath) {
      return { ok: false, error: 'Missing transfer path' };
    }
    const transferId = payload.id || `upload-${Date.now()}`;
    await sessionManager.upload(tabId, localPath, remotePath, transferId);
    return { ok: true, id: transferId };
  });

  ipcMain.handle('settings:open', () => {
    createSettingsWindow();
    return { ok: true };
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await sessionManager.disconnectAll();
});

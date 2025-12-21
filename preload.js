const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('preloadReady', true);
contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  updateState: (patch) => ipcRenderer.invoke('app:update-state', patch),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getHosts: () => ipcRenderer.invoke('ssh:hosts'),
  connect: (tabId, host) => ipcRenderer.invoke('ssh:connect', { tabId, host }),
  disconnect: (tabId) => ipcRenderer.invoke('ssh:disconnect', { tabId }),
  write: (tabId, data) => ipcRenderer.send('ssh:write', { tabId, data }),
  resize: (tabId, cols, rows) => ipcRenderer.send('ssh:resize', { tabId, size: { cols, rows } }),
  list: (tabId, remotePath) => ipcRenderer.invoke('sftp:list', { tabId, path: remotePath }),
  listLocal: (tabId, localPath) => ipcRenderer.invoke('local:list', { tabId, path: localPath }),
  download: (tabId, payload) => ipcRenderer.invoke('sftp:download', { tabId, ...payload }),
  upload: (tabId, payload) => ipcRenderer.invoke('sftp:upload', { tabId, ...payload }),
  openExternal: (target) => ipcRenderer.invoke('shell:open-external', target),
  execLocal: (command) => ipcRenderer.invoke('shell:exec', { command }),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  onSshData: (handler) => ipcRenderer.on('ssh:data', (event, payload) => handler(payload)),
  onSshCwd: (handler) => ipcRenderer.on('ssh:cwd', (event, payload) => handler(payload)),
  onSshExit: (handler) => ipcRenderer.on('ssh:exit', (event, payload) => handler(payload)),
  onSshPrompt: (handler) => ipcRenderer.on('ssh:prompt', (event, payload) => handler(payload)),
  onSftpProgress: (handler) => ipcRenderer.on('sftp:progress', (event, payload) => handler(payload))
});

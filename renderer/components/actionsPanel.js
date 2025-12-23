import { getActiveTab, getTab } from '../state.js';
import { escapeShellPath, normalizeRemotePath, formatRemotePath } from '../utils.js';

export function createActionsPanel(state, persistenceService, filesPanel) {
  const {
    commandsList,
    transferStatus,
    uploadInput,
    uploadRemoteInput,
    uploadButton,
    downloadRemoteInput,
    downloadButton,
    commandNameInput,
    commandCwdInput,
    commandCommandInput,
    commandSaveButton,
    commandCancelButton
  } = state.elements;

  let editingIndex = null;

  function saveCommands(nextCommands) {
    state.appState = { ...state.appState, commands: nextCommands };
    state.api.updateState({ commands: nextCommands });
    renderCommands(nextCommands);
  }

  function resetCommandForm() {
    editingIndex = null;
    if (commandNameInput) commandNameInput.value = '';
    if (commandCwdInput) commandCwdInput.value = '';
    if (commandCommandInput) commandCommandInput.value = '';
    if (commandSaveButton) commandSaveButton.textContent = 'Add command';
  }

  function setCommandForm(command, index) {
    editingIndex = index;
    if (commandNameInput) commandNameInput.value = command.name || '';
    if (commandCwdInput) commandCwdInput.value = command.cwd || '';
    if (commandCommandInput) commandCommandInput.value = command.command || '';
    if (commandSaveButton) commandSaveButton.textContent = 'Update command';
  }

  function createTransferRow(id, label) {
    const tab = getActiveTab(state);
    if (!tab) return null;
    const row = document.createElement('div');
    row.className = 'transfer-row';
    row.dataset.id = id;
    row.innerHTML = '<span class="transfer-label"></span><span class="transfer-progress">0%</span>';
    row.querySelector('.transfer-label').textContent = label;
    tab.transferRows.set(id, row);
    if (tab.id === state.activeTabId) {
      transferStatus.prepend(row);
    }
    return row;
  }

  function updateTransferRowForTab(tabId, transferred, total, id) {
    const tab = getTab(state, tabId);
    if (!tab) return;
    const row = tab.transferRows.get(id);
    if (!row) return;
    const progress = row.querySelector('.transfer-progress');
    if (!total) {
      progress.textContent = `${transferred} bytes`;
    } else {
      const percent = Math.min(100, Math.round((transferred / total) * 100));
      progress.textContent = `${percent}%`;
    }
    if (tabId === state.activeTabId && row.parentElement !== transferStatus) {
      renderTransfers();
    }
  }

  function markTransferComplete(id, text) {
    const tab = getActiveTab(state);
    if (!tab) return;
    const row = tab.transferRows.get(id);
    if (!row) return;
    const progress = row.querySelector('.transfer-progress');
    progress.textContent = text || 'done';
    row.classList.add('complete');
  }

  function renderTransfers() {
    transferStatus.innerHTML = '';
    const tab = getActiveTab(state);
    if (!tab) return;
    for (const row of tab.transferRows.values()) {
      transferStatus.appendChild(row);
    }
  }

  function renderCommands(commands) {
    commandsList.innerHTML = '';
    if (!commands || commands.length === 0) {
      commandsList.textContent = 'No commands saved';
      return;
    }
    commands.forEach((command, index) => {
      const row = document.createElement('div');
      row.className = 'command-row';

      const main = document.createElement('div');
      main.className = 'command-main';

      const title = document.createElement('div');
      title.className = 'command-title';
      title.textContent = command.name || command.command;

      const sub = document.createElement('div');
      sub.className = 'command-sub';
      const cwdLabel = command.cwd ? `${command.cwd} - ` : '';
      sub.textContent = `${cwdLabel}${command.command}`;

      main.appendChild(title);
      main.appendChild(sub);

      const actions = document.createElement('div');
      actions.className = 'command-actions';

      const runButton = document.createElement('button');
      runButton.type = 'button';
      runButton.textContent = 'Run';
      runButton.addEventListener('click', () => {
        const tab = getActiveTab(state);
        if (!tab || !tab.connected) {
          persistenceService.setStatus('Not connected', true, tab);
          return;
        }
        tab.isBusy = true;
        const prefix = command.cwd ? `cd ${escapeShellPath(command.cwd)} && ` : '';
        state.api.write(tab.id, `${prefix}${command.command}\n`);
        if (command.cwd && filesPanel) {
          filesPanel.updateTabPath(tab, command.cwd, {
            pushNav: true,
            recordRecent: true,
            clearCache: true,
            force: true
          });
        }
      });

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => {
        setCommandForm(command, index);
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => {
        const next = commands.filter((item, itemIndex) => itemIndex !== index);
        saveCommands(next);
        if (editingIndex === index) {
          resetCommandForm();
        } else if (editingIndex !== null && editingIndex >= next.length) {
          resetCommandForm();
        }
      });

      actions.appendChild(runButton);
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);

      row.appendChild(main);
      row.appendChild(actions);
      commandsList.appendChild(row);
    });
  }

  function bindEvents() {
    if (commandSaveButton) {
      commandSaveButton.addEventListener('click', () => {
        const name = (commandNameInput && commandNameInput.value.trim()) || '';
        const command = (commandCommandInput && commandCommandInput.value.trim()) || '';
        const cwd = (commandCwdInput && commandCwdInput.value.trim()) || '';
        if (!command) {
          persistenceService.setStatus('Command is required', true, getActiveTab(state));
          return;
        }
        const next = [...(state.appState.commands || [])];
        const payload = { name: name || command, command, cwd };
        if (editingIndex !== null && next[editingIndex]) {
          next[editingIndex] = payload;
        } else {
          next.push(payload);
        }
        saveCommands(next);
        resetCommandForm();
      });
    }

    if (commandCancelButton) {
      commandCancelButton.addEventListener('click', () => {
        resetCommandForm();
      });
    }

    uploadButton.addEventListener('click', async () => {
      const tab = getActiveTab(state);
      if (!tab || !tab.connected) {
        persistenceService.setStatus('Not connected', true, tab);
        return;
      }
      if (tab.sessionType === 'local') {
        persistenceService.setStatus('SFTP unavailable for local session', true, tab);
        return;
      }
      const file = uploadInput.files[0];
      const rawRemote = uploadRemoteInput.value.trim();
      if (!file || !rawRemote) {
        persistenceService.setStatus('Select a file and remote path', true, tab);
        return;
      }
      const remotePath = normalizeRemotePath(rawRemote, tab.currentPath, { pathStyle: tab.remotePathStyle });
      const id = `upload-${Date.now()}`;
      createTransferRow(id, `Upload ${file.name}`);
      const result = await state.api.upload(tab.id, { localPath: file.path, remotePath, id });
      if (result && result.ok) {
        markTransferComplete(id, 'uploaded');
      } else {
        markTransferComplete(id, 'error');
      }
    });

    downloadButton.addEventListener('click', async () => {
      const tab = getActiveTab(state);
      if (!tab || !tab.connected) {
        persistenceService.setStatus('Not connected', true, tab);
        return;
      }
      if (tab.sessionType === 'local') {
        persistenceService.setStatus('SFTP unavailable for local session', true, tab);
        return;
      }
      const rawRemote = downloadRemoteInput.value.trim();
      if (!rawRemote) {
        persistenceService.setStatus('Enter a remote path', true, tab);
        return;
      }
      const id = `download-${Date.now()}`;
      const remotePath = normalizeRemotePath(rawRemote, tab.currentPath, { pathStyle: tab.remotePathStyle });
      createTransferRow(id, `Download ${formatRemotePath(remotePath, tab.remotePathStyle)}`);
      const result = await state.api.download(tab.id, { remotePath, id });
      if (result && result.ok) {
        markTransferComplete(id, 'downloaded');
      } else {
        markTransferComplete(id, 'error');
      }
    });
  }

  bindEvents();

  return {
    renderCommands,
    renderTransfers,
    createTransferRow,
    markTransferComplete,
    updateTransferRowForTab
  };
}

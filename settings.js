(() => {
  const api = window.api;
  const statusEl = document.getElementById('settings-status');
  const editorMode = document.getElementById('editor-mode');
  const editorCommand = document.getElementById('editor-command');
  const editorLocalCommand = document.getElementById('editor-local-command');
  const editorUri = document.getElementById('editor-uri');
  const editorAssociations = document.getElementById('editor-associations');
  const treePageSize = document.getElementById('tree-page-size');
  const restoreTabs = document.getElementById('restore-tabs');
  const autoConnect = document.getElementById('auto-connect');
  const shortcutNewTab = document.getElementById('shortcut-new-tab');
  const shortcutCloseTab = document.getElementById('shortcut-close-tab');

  let settings = null;
  let saveTimer = null;

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function readValue(path, fallback) {
    const [category, subcategory, field] = path;
    const node = settings && settings[category] && settings[category][subcategory] && settings[category][subcategory][field];
    if (node && Object.prototype.hasOwnProperty.call(node, 'value')) {
      return node.value;
    }
    return fallback;
  }

  function readList(path, fallback) {
    const value = readValue(path, fallback);
    return Array.isArray(value) ? value : fallback;
  }

  function writeValue(path, type, value) {
    const [category, subcategory, field] = path;
    if (!settings[category]) settings[category] = {};
    if (!settings[category][subcategory]) settings[category][subcategory] = {};
    settings[category][subcategory][field] = { type, value };
  }

  function scheduleSave() {
    setStatus('Saving...');
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(async () => {
      try {
        const updated = await api.updateSettings(settings);
        settings = updated || settings;
        setStatus('Saved');
      } catch (err) {
        setStatus('Save failed', true);
      }
    }, 300);
  }

  function bindInputs() {
    editorMode.addEventListener('change', () => {
      writeValue(['editor', 'open', 'mode'], 'string', editorMode.value);
      scheduleSave();
    });
    editorCommand.addEventListener('input', () => {
      writeValue(['editor', 'open', 'commandTemplate'], 'string', editorCommand.value);
      scheduleSave();
    });
    editorLocalCommand.addEventListener('input', () => {
      writeValue(['editor', 'open', 'localCommandTemplate'], 'string', editorLocalCommand.value);
      scheduleSave();
    });
    editorUri.addEventListener('input', () => {
      writeValue(['editor', 'open', 'sftpUriTemplate'], 'string', editorUri.value);
      scheduleSave();
    });
    editorAssociations.addEventListener('input', () => {
      try {
        const parsed = JSON.parse(editorAssociations.value || '[]');
        if (!Array.isArray(parsed)) {
          throw new Error('Associations must be an array');
        }
        writeValue(['editor', 'associations', 'list'], 'array', parsed);
        setStatus('Saving...');
        scheduleSave();
      } catch (err) {
        setStatus('Invalid JSON for associations', true);
      }
    });
    treePageSize.addEventListener('input', () => {
      const parsed = Number(treePageSize.value);
      writeValue(['ui', 'tree', 'pageSize'], 'number', Number.isNaN(parsed) ? 500 : parsed);
      scheduleSave();
    });
    restoreTabs.addEventListener('change', () => {
      writeValue(['ui', 'session', 'restoreTabs'], 'boolean', restoreTabs.checked);
      scheduleSave();
    });
    autoConnect.addEventListener('change', () => {
      writeValue(['ui', 'connection', 'autoConnectOnSelect'], 'boolean', autoConnect.checked);
      scheduleSave();
    });
    shortcutNewTab.addEventListener('input', () => {
      writeValue(['ui', 'shortcuts', 'newTab'], 'string', shortcutNewTab.value.trim());
      scheduleSave();
    });
    shortcutCloseTab.addEventListener('input', () => {
      writeValue(['ui', 'shortcuts', 'closeTab'], 'string', shortcutCloseTab.value.trim());
      scheduleSave();
    });
  }

  async function init() {
    if (!api) {
      setStatus('IPC unavailable', true);
      return;
    }
    try {
      settings = await api.getSettings();
      editorMode.value = readValue(['editor', 'open', 'mode'], 'remote-shell');
      editorCommand.value = readValue(['editor', 'open', 'commandTemplate'], 'nano {escapedPath}');
      editorLocalCommand.value = readValue(['editor', 'open', 'localCommandTemplate'], 'code --reuse-window {path}');
      editorUri.value = readValue(['editor', 'open', 'sftpUriTemplate'], 'sftp://{user}@{host}:{port}{path}');
      editorAssociations.value = JSON.stringify(
        readList(['editor', 'associations', 'list'], []),
        null,
        2
      );
      treePageSize.value = readValue(['ui', 'tree', 'pageSize'], 500);
      restoreTabs.checked = Boolean(readValue(['ui', 'session', 'restoreTabs'], false));
      autoConnect.checked = Boolean(readValue(['ui', 'connection', 'autoConnectOnSelect'], false));
      shortcutNewTab.value = readValue(['ui', 'shortcuts', 'newTab'], 'mod+t');
      shortcutCloseTab.value = readValue(['ui', 'shortcuts', 'closeTab'], 'mod+w');
      bindInputs();
    } catch (err) {
      setStatus('Failed to load settings', true);
    }
  }

  init();
})();

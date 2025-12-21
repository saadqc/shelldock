const path = require('path');

const ICON_PATH = path.join(__dirname, '..', 'assets', 'icons', 'dock.png');
const LOCAL_HOST_VALUE = '__local__';

const DEFAULT_STATE = {
  knownHosts: [],
  lastHost: '',
  recentLocations: {},
  savedLocations: {},
  tabs: [],
  activeTabId: '',
  commands: [
    {
      name: 'Restart App',
      command: 'pm2 restart app',
      cwd: '/var/www/app'
    }
  ]
};

const DEFAULT_SETTINGS = {
  editor: {
    open: {
      mode: { type: 'string', value: 'remote-shell' },
      commandTemplate: { type: 'string', value: 'nano {escapedPath}' },
      localCommandTemplate: { type: 'string', value: 'code --reuse-window {path}' },
      sftpUriTemplate: { type: 'string', value: 'sftp://{user}@{host}:{port}{path}' }
    },
    associations: {
      list: {
        type: 'array',
        value: [
          {
            pattern: '*.log',
            mode: 'remote-shell',
            commandTemplate: 'less {escapedPath}'
          }
        ]
      }
    }
  },
  ui: {
    tree: {
      pageSize: { type: 'number', value: 500 }
    },
    session: {
      restoreTabs: { type: 'boolean', value: false }
    },
    shortcuts: {
      newTab: { type: 'string', value: 'mod+t' },
      closeTab: { type: 'string', value: 'mod+w' }
    },
    connection: {
      autoConnectOnSelect: { type: 'boolean', value: false }
    }
  },
  shell: {
    local: {
      command: { type: 'string', value: '' },
      args: { type: 'string', value: '' },
      pathPrepend: { type: 'string', value: '' },
      injectMacPaths: { type: 'boolean', value: true }
    }
  }
};

module.exports = {
  DEFAULT_STATE,
  DEFAULT_SETTINGS,
  ICON_PATH,
  LOCAL_HOST_VALUE
};

const fs = require('fs');
const os = require('os');
const path = require('path');
const pty = require('node-pty');
const SftpClient = require('ssh2-sftp-client');
require('ssh2');

const OSC7_PREFIX = '\u001b]7;file://';
const OSC7_BEL = '\u0007';
const OSC7_ST = '\u001b\\';

function readSetting(settings, category, subcategory, field, fallback) {
  const node = settings && settings[category] && settings[category][subcategory]
    ? settings[category][subcategory][field]
    : null;
  if (node && Object.prototype.hasOwnProperty.call(node, 'value')) {
    return node.value;
  }
  return fallback;
}

function stripWrappingQuotes(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitArgs(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return [];
  }
  const args = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) {
    args.push(current);
  }
  return args;
}

function splitPathList(value) {
  return String(value || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function getDefaultLocalShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  if (process.env.SHELL) {
    return process.env.SHELL;
  }
  if (process.platform === 'darwin') {
    return '/bin/zsh';
  }
  return '/bin/bash';
}

function getDefaultLocalShellArgs(shellPath) {
  if (process.platform === 'win32') {
    return [];
  }
  const base = path.basename(shellPath || '').toLowerCase();
  const normalized = base.endsWith('.exe') ? base.slice(0, -4) : base;
  if (normalized === 'zsh' || normalized === 'bash') {
    return ['-l'];
  }
  return [];
}

function getMacBrewEntries() {
  const entries = [];
  if (fs.existsSync('/opt/homebrew/bin')) {
    entries.push('/opt/homebrew/bin');
  }
  if (fs.existsSync('/opt/homebrew/sbin')) {
    entries.push('/opt/homebrew/sbin');
  }
  if (fs.existsSync('/usr/local/bin')) {
    entries.push('/usr/local/bin');
  }
  if (fs.existsSync('/usr/local/sbin')) {
    entries.push('/usr/local/sbin');
  }
  return entries;
}

function getLocalPathPrependEntries(settings) {
  const entries = [];
  if (process.platform === 'darwin') {
    entries.push(...getMacBrewEntries());
  }
  const configured = readSetting(settings, 'shell', 'local', 'pathPrepend', '');
  const normalized = String(configured || '').trim();
  if (normalized && normalized.toLowerCase() !== 'auto') {
    entries.push(...splitPathList(normalized));
  }
  return mergePathEntries(entries, []);
}

function buildLocalBootstrapScript(settings) {
  if (process.platform === 'win32') {
    return '';
  }
  const prependEntries = getLocalPathPrependEntries(settings);
  if (!prependEntries.length) {
    return '';
  }
  const quotedEntries = prependEntries.map((entry) => shellQuote(entry)).join(' ');
  return [
    '__shelldock_prepend_path() {',
    '  local entry',
    `  for entry in ${quotedEntries}; do`,
    '    case ":$PATH:" in',
    '      *":$entry:"*) ;;',
    '      *) PATH="$entry:$PATH";;',
    '    esac',
    '  done',
    '  export PATH',
    '}',
    '__shelldock_prepend_path'
  ].join('\n');
}

function readLines(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err) {
    return [];
  }
}

function getMacPathEntries() {
  const entries = [];
  for (const line of readLines('/etc/paths')) {
    entries.push(line);
  }
  try {
    const extraFiles = fs.readdirSync('/etc/paths.d').sort();
    for (const filename of extraFiles) {
      const fullPath = path.join('/etc/paths.d', filename);
      for (const line of readLines(fullPath)) {
        entries.push(line);
      }
    }
  } catch (err) {
  }
  return entries;
}

function mergePathEntries(primary, extra) {
  const seen = new Set();
  const merged = [];
  for (const entry of primary) {
    if (entry && !seen.has(entry)) {
      seen.add(entry);
      merged.push(entry);
    }
  }
  for (const entry of extra) {
    if (entry && !seen.has(entry)) {
      seen.add(entry);
      merged.push(entry);
    }
  }
  return merged;
}

function buildLocalEnv(shellPath) {
  const env = { ...process.env };
  if (process.platform === 'darwin') {
    const baseEntries = String(env.PATH || '')
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const systemEntries = getMacPathEntries();
    const merged = mergePathEntries([...getMacBrewEntries(), ...baseEntries], systemEntries);
    if (merged.length) {
      env.PATH = merged.join(path.delimiter);
    }
  }
  if (shellPath) {
    env.SHELL = shellPath;
  }
  return env;
}

function parseOsc7Payload(payload) {
  const slashIndex = payload.indexOf('/');
  const pathPart = slashIndex >= 0 ? payload.slice(slashIndex) : '/';
  if (!pathPart) {
    return '/';
  }
  try {
    return decodeURIComponent(pathPart);
  } catch (err) {
    return pathPart;
  }
}

function consumeOsc7Sequences(session, data) {
  session.osc7Buffer += data;
  const paths = [];
  let index = session.osc7Buffer.indexOf(OSC7_PREFIX);
  while (index !== -1) {
    const start = index + OSC7_PREFIX.length;
    const belIndex = session.osc7Buffer.indexOf(OSC7_BEL, start);
    const stIndex = session.osc7Buffer.indexOf(OSC7_ST, start);
    let end = -1;
    let endLength = 0;
    if (belIndex !== -1 && (stIndex === -1 || belIndex < stIndex)) {
      end = belIndex;
      endLength = 1;
    } else if (stIndex !== -1) {
      end = stIndex;
      endLength = 2;
    }
    if (end === -1) {
      break;
    }
    const payload = session.osc7Buffer.slice(start, end);
    const pathValue = parseOsc7Payload(payload);
    if (pathValue) {
      paths.push(pathValue);
    }
    session.osc7Buffer = session.osc7Buffer.slice(end + endLength);
    index = session.osc7Buffer.indexOf(OSC7_PREFIX);
  }

  if (session.osc7Buffer.length > 4096) {
    session.osc7Buffer = session.osc7Buffer.slice(-4096);
  }

  return paths;
}

function injectPromptTracking(session, settings) {
  if (!session || !session.ptyProcess) {
    return;
  }
  const parts = [];
  const localBootstrap = session.sessionType === 'local'
    ? buildLocalBootstrapScript(settings)
    : '';
  if (localBootstrap) {
    parts.push(localBootstrap);
  }
  parts.push([
    '__shelldock_pwd() { printf "\\033]7;file://%s%s\\007" "${HOSTNAME:-localhost}" "$PWD"; }',
    'if [ -n "$ZSH_VERSION" ]; then',
    '  precmd_functions+=(__shelldock_pwd)',
    'else',
    '  export PROMPT_COMMAND="__shelldock_pwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"',
    'fi'
  ].join('\n'));
  session.ptyProcess.write(`${parts.join('\n')}\n`);
}

function createSessionManager({ sendToRenderer, logDebug, getSettings }) {
  const sessions = new Map();

  function getSession(tabId) {
    if (!tabId) {
      return null;
    }
    if (!sessions.has(tabId)) {
      sessions.set(tabId, {
        ptyProcess: null,
        sftpClient: null,
        listCache: new Map(),
        osc7Buffer: '',
        lastCwd: '',
        hostConfig: null,
        sessionType: null
      });
    }
    return sessions.get(tabId);
  }

  function send(channel, payload) {
    if (typeof sendToRenderer === 'function') {
      sendToRenderer(channel, payload);
    }
  }

  async function connectSftp(tabId, hostConfig) {
    const session = getSession(tabId);
    if (!session) {
      throw new Error('Invalid tab');
    }
    const connectionOptions = {
      host: hostConfig.hostName || hostConfig.alias,
      port: hostConfig.port ? Number(hostConfig.port) : 22,
      username: hostConfig.user || process.env.USER,
      agent: process.env.SSH_AUTH_SOCK,
      keepaliveInterval: 10000,
      readyTimeout: 20000
    };

    if (hostConfig.identityFile) {
      try {
        connectionOptions.privateKey = fs.readFileSync(hostConfig.identityFile, 'utf8');
      } catch (err) {
      }
    }

    session.sftpClient = new SftpClient();
    await session.sftpClient.connect(connectionOptions);
    session.listCache.clear();
  }

  function spawnSshShell(tabId, hostConfig) {
    const session = getSession(tabId);
    if (!session) {
      return;
    }
    const args = ['-tt'];
    if (hostConfig.port) {
      args.push('-p', String(hostConfig.port));
    }
    if (hostConfig.identityFile) {
      args.push('-i', hostConfig.identityFile);
    }
    args.push('-o', 'ServerAliveInterval=30');
    args.push('-o', 'ServerAliveCountMax=3');

    const targetHost = hostConfig.hostName || hostConfig.alias;
    const target = hostConfig.user ? `${hostConfig.user}@${targetHost}` : targetHost;
    args.push(target);

    session.hostConfig = hostConfig;
    session.sessionType = 'ssh';
    session.ptyProcess = pty.spawn('ssh', args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: process.env
    });

    session.ptyProcess.onData((data) => {
      const cwdUpdates = consumeOsc7Sequences(session, data);
      for (const cwd of cwdUpdates) {
        if (cwd) {
          if (cwd !== session.lastCwd) {
            session.lastCwd = cwd;
            send('ssh:cwd', { tabId, cwd });
          }
          send('ssh:prompt', { tabId, cwd });
        }
      }
      send('ssh:data', { tabId, data });
    });

    session.ptyProcess.onExit(() => {
      send('ssh:exit', { tabId });
    });

    setTimeout(() => injectPromptTracking(session, null), 600);
  }

  function spawnLocalShell(tabId) {
    const session = getSession(tabId);
    if (!session) {
      return;
    }
    const settings = typeof getSettings === 'function' ? getSettings() : null;
    const commandSetting = readSetting(settings, 'shell', 'local', 'command', '');
    const argsSetting = readSetting(settings, 'shell', 'local', 'args', '');
    const normalizedCommand = stripWrappingQuotes(commandSetting);
    const useDefault = !normalizedCommand || normalizedCommand.toLowerCase() === 'auto';
    const shell = useDefault ? getDefaultLocalShell() : normalizedCommand;
    const rawArgs = String(argsSetting || '').trim();
    const useDefaultArgs = !rawArgs || rawArgs.toLowerCase() === 'auto';
    const args = useDefaultArgs ? getDefaultLocalShellArgs(shell) : splitArgs(rawArgs);
    const env = buildLocalEnv(shell);
    session.hostConfig = { alias: 'local', type: 'local' };
    session.sessionType = 'local';
    session.ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env
    });

    session.ptyProcess.onData((data) => {
      const cwdUpdates = consumeOsc7Sequences(session, data);
      for (const cwd of cwdUpdates) {
        if (cwd) {
          if (cwd !== session.lastCwd) {
            session.lastCwd = cwd;
            send('ssh:cwd', { tabId, cwd });
          }
          send('ssh:prompt', { tabId, cwd });
        }
      }
      send('ssh:data', { tabId, data });
    });

    session.ptyProcess.onExit(() => {
      send('ssh:exit', { tabId });
    });

    setTimeout(() => injectPromptTracking(session, settings), 300);
  }

  async function disconnect(tabId) {
    const session = getSession(tabId);
    if (!session) {
      return;
    }
    if (session.ptyProcess) {
      try {
        session.ptyProcess.kill();
      } catch (err) {
      }
      session.ptyProcess = null;
    }
    if (session.sftpClient) {
      try {
        await session.sftpClient.end();
      } catch (err) {
      }
      session.sftpClient = null;
    }
    session.listCache.clear();
    session.osc7Buffer = '';
    session.lastCwd = '';
    session.hostConfig = null;
    session.sessionType = null;
  }

  function ensureSftpReady(tabId) {
    const session = getSession(tabId);
    if (!session) {
      throw new Error('Not connected');
    }
    if (session.sessionType === 'local') {
      throw new Error('SFTP unavailable for local session');
    }
    if (!session.sftpClient) {
      throw new Error('Not connected');
    }
    return session;
  }

  function sendProgress(tabId, id, transferred, total) {
    send('sftp:progress', { tabId, id, transferred, total });
  }

  async function download(tabId, remotePath, localPath, id) {
    const session = ensureSftpReady(tabId);
    let totalSize = 0;
    sendProgress(tabId, id, 0, totalSize);
    await session.sftpClient.fastGet(remotePath, localPath, {
      step: (transferred, chunk, total) => {
        totalSize = total || totalSize;
        sendProgress(tabId, id, transferred, totalSize);
      }
    });
    sendProgress(tabId, id, totalSize, totalSize);
  }

  async function upload(tabId, localPath, remotePath, id) {
    const session = ensureSftpReady(tabId);
    let totalSize = 0;
    sendProgress(tabId, id, 0, totalSize);
    await session.sftpClient.fastPut(localPath, remotePath, {
      step: (transferred, chunk, total) => {
        totalSize = total || totalSize;
        sendProgress(tabId, id, transferred, totalSize);
      }
    });
    sendProgress(tabId, id, totalSize, totalSize);
    session.listCache.delete(path.posix.dirname(remotePath));
  }

  async function connect(tabId, hostConfig) {
    await disconnect(tabId);
    try {
      if (hostConfig && hostConfig.type === 'local') {
        spawnLocalShell(tabId);
        return;
      }
      spawnSshShell(tabId, hostConfig);
      await connectSftp(tabId, hostConfig);
    } catch (err) {
      await disconnect(tabId);
      throw err;
    }
  }

  async function connectLocal(tabId) {
    await disconnect(tabId);
    try {
      spawnLocalShell(tabId);
    } catch (err) {
      await disconnect(tabId);
      throw err;
    }
  }

  function write(tabId, data) {
    const session = getSession(tabId);
    if (session && session.ptyProcess) {
      session.ptyProcess.write(data);
    }
  }

  function resize(tabId, cols, rows) {
    const session = getSession(tabId);
    if (session && session.ptyProcess && cols && rows) {
      session.ptyProcess.resize(cols, rows);
    }
  }

  async function list(tabId, remotePath) {
    const session = ensureSftpReady(tabId);
    if (session.listCache.has(remotePath)) {
      return session.listCache.get(remotePath);
    }
    const list = await session.sftpClient.list(remotePath);
    const normalized = list
      .filter((entry) => entry.name !== '.' && entry.name !== '..')
      .map((entry) => ({
        name: entry.name,
        type: entry.type,
        path: path.posix.join(remotePath, entry.name),
        size: entry.size
      }));
    session.listCache.set(remotePath, normalized);
    return normalized;
  }

  async function listLocal(tabId, localPath) {
    const session = getSession(tabId);
    if (!session || session.sessionType !== 'local') {
      throw new Error('Local session not connected');
    }
    const targetPath = localPath || os.homedir();
    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      let type = entry.isDirectory() ? 'd' : '-';
      let size = 0;
      if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(fullPath);
          size = stat.size || 0;
        } catch (err) {
        }
      } else if (entry.isSymbolicLink()) {
        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.isDirectory()) {
            type = 'd';
          }
          if (stat.isFile()) {
            size = stat.size || 0;
          }
        } catch (err) {
        }
      }
      items.push({
        name: entry.name,
        type,
        path: fullPath,
        size
      });
    }
    return items;
  }

  async function disconnectAll() {
    for (const tabId of sessions.keys()) {
      await disconnect(tabId);
    }
  }

  return {
    connect,
    connectLocal,
    disconnect,
    disconnectAll,
    write,
    resize,
    list,
    listLocal,
    download,
    upload,
    ensureSftpReady,
    getSession
  };
}

module.exports = {
  createSessionManager
};

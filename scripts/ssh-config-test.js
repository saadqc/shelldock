const fs = require('fs');
const os = require('os');
const path = require('path');

function expandHome(value) {
  if (!value) return value;
  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function sanitizeConfigValue(value) {
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  return expandHome(unquoted);
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`);
}

function stripInlineComment(value) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '\'' && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === '#' && !inSingle && !inDouble) {
      return value.slice(0, i);
    }
  }
  return value;
}

function splitConfigTokens(value) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '\'' && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(char) && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function parseConfigLine(rawLine) {
  const stripped = stripInlineComment(rawLine).trim();
  if (!stripped) {
    return null;
  }
  const match = stripped.match(/^([^=\s]+)\s*(?:=)?\s*(.+)$/);
  if (!match) {
    return null;
  }
  return { key: match[1], value: match[2] };
}

function resolveIncludePaths(value, baseDir) {
  const entries = splitConfigTokens(value).filter(Boolean);
  const results = [];
  for (const entry of entries) {
    let resolved = sanitizeConfigValue(entry);
    if (!path.isAbsolute(resolved)) {
      resolved = path.join(baseDir, resolved);
    }
    if (!resolved.includes('*') && !resolved.includes('?')) {
      results.push(resolved);
      continue;
    }
    const dir = path.dirname(resolved);
    const pattern = path.basename(resolved);
    if (!fs.existsSync(dir)) {
      continue;
    }
    const matcher = globToRegExp(pattern);
    for (const name of fs.readdirSync(dir)) {
      if (matcher.test(name)) {
        results.push(path.join(dir, name));
      }
    }
  }
  return results;
}

function applyConfigValue(target, key, value) {
  switch (key) {
    case 'hostname':
      target.hostName = value;
      break;
    case 'user':
      target.user = value;
      break;
    case 'port':
      target.port = value;
      break;
    case 'identityfile':
      target.identityFile = value;
      break;
    default:
      break;
  }
}

function parseSshConfigFile(filePath, config) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const baseDir = path.dirname(filePath);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let currentHosts = [];
  let isDefaultBlock = false;

  for (const rawLine of lines) {
    const parsed = parseConfigLine(rawLine);
    if (!parsed) {
      continue;
    }
    const keyLower = parsed.key.toLowerCase();
    const value = parsed.value;

    if (keyLower === 'include') {
      const includePaths = resolveIncludePaths(value, baseDir);
      for (const includePath of includePaths) {
        parseSshConfigFile(includePath, config);
      }
      continue;
    }

    if (keyLower === 'match') {
      currentHosts = [];
      isDefaultBlock = false;
      continue;
    }

    if (keyLower === 'host') {
      currentHosts = splitConfigTokens(value)
        .map((host) => sanitizeConfigValue(host))
        .filter(Boolean);
      isDefaultBlock = currentHosts.length === 1 && currentHosts[0] === '*';
      if (!isDefaultBlock) {
        for (const host of currentHosts) {
          if (host.startsWith('!')) {
            continue;
          }
          if (!config.hosts[host]) {
            config.hosts[host] = {};
          }
        }
      }
      continue;
    }

    if (currentHosts.length === 0) {
      continue;
    }

    const normalizedValue = sanitizeConfigValue(value);
    if (isDefaultBlock) {
      applyConfigValue(config.defaults, keyLower, normalizedValue);
    } else {
      for (const host of currentHosts) {
        if (host.startsWith('!')) {
          continue;
        }
        applyConfigValue(config.hosts[host], keyLower, normalizedValue);
      }
    }
  }
}

function loadSshConfig() {
  const config = { hosts: {}, defaults: {} };
  const configPath = path.join(os.homedir(), '.ssh', 'config');
  parseSshConfigFile(configPath, config);
  return config;
}

function listConfigHosts() {
  const config = loadSshConfig();
  const entries = Object.entries(config.hosts)
    .filter(([alias]) => !alias.includes('*') && !alias.includes('?'))
    .map(([alias, values]) => ({
      alias,
      ...config.defaults,
      ...values
    }));
  entries.sort((a, b) => a.alias.localeCompare(b.alias));
  return entries;
}

const hosts = listConfigHosts();
if (hosts.length === 0) {
  console.log('No hosts found in ~/.ssh/config');
} else {
  console.log(`Found ${hosts.length} hosts:`);
  for (const host of hosts) {
    console.log(`- ${host.alias}`);
  }
}

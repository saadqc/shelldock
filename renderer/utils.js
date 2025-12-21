export function escapeShellPath(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function normalizeRemotePath(value, basePath) {
  if (!value) {
    return '/';
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return '/';
  }
  const isAbsolute = trimmed.startsWith('/');
  const base = isAbsolute ? '/' : (basePath || '/');
  const raw = isAbsolute ? trimmed : `${base.replace(/\/$/, '')}/${trimmed}`;
  const parts = raw.split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `/${stack.join('/')}` || '/';
}

export function getPathLabel(value) {
  const trimmed = String(value || '').replace(/\/$/, '');
  if (!trimmed) {
    return '/';
  }
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '/';
}

export function fillTemplate(template, context) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return context[key];
    }
    return match;
  });
}

export function globToRegex(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`, 'i');
}

export function matchAssociation(fileName, associations) {
  if (!fileName || !Array.isArray(associations)) {
    return null;
  }
  for (const assoc of associations) {
    if (!assoc || !assoc.pattern) {
      continue;
    }
    const pattern = String(assoc.pattern);
    let matched = false;
    if (pattern.includes('*') || pattern.includes('?')) {
      matched = globToRegex(pattern).test(fileName);
    } else if (pattern.startsWith('.')) {
      matched = fileName.toLowerCase().endsWith(pattern.toLowerCase());
    } else {
      matched = fileName.toLowerCase() === pattern.toLowerCase();
    }
    if (matched) {
      return assoc;
    }
  }
  return null;
}

export function normalizeFileInput(fileInput) {
  if (!fileInput) {
    return { name: '', path: '' };
  }
  if (typeof fileInput === 'string') {
    const name = getPathLabel(fileInput);
    return { name, path: fileInput };
  }
  return {
    name: fileInput.name || getPathLabel(fileInput.path),
    path: fileInput.path,
    size: fileInput.size
  };
}

export function buildSftpUri(template, context) {
  const host = context.host || context.alias || '';
  if (!host) {
    return '';
  }
  const user = context.user || '';
  const port = context.port || '22';
  const pathValue = context.path || '/';
  const userPart = user ? `${user}@` : '';
  const base = `sftp://${userPart}${host}:${port}${pathValue}`;
  const filled = fillTemplate(template || base, { ...context, sftpUri: base });
  return filled || base;
}

export function parseShortcut(value, isMac) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const parts = value.toLowerCase().split(/\s*\+\s*/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return null;
  }
  const shortcut = {
    key: '',
    ctrl: false,
    meta: false,
    alt: false,
    shift: false
  };
  for (const part of parts) {
    if (part === 'cmd' || part === 'command' || part === 'meta') {
      shortcut.meta = true;
      continue;
    }
    if (part === 'ctrl' || part === 'control') {
      shortcut.ctrl = true;
      continue;
    }
    if (part === 'alt' || part === 'option' || part === 'opt') {
      shortcut.alt = true;
      continue;
    }
    if (part === 'shift') {
      shortcut.shift = true;
      continue;
    }
    if (part === 'mod' || part === 'cmdorctrl' || part === 'commandorcontrol') {
      if (isMac) {
        shortcut.meta = true;
      } else {
        shortcut.ctrl = true;
      }
      continue;
    }
    shortcut.key = part;
  }
  if (!shortcut.key) {
    return null;
  }
  return shortcut;
}

export function matchesShortcutEvent(event, shortcut) {
  if (!shortcut || !event) {
    return false;
  }
  const key = event.key ? event.key.toLowerCase() : '';
  if (!key || key !== shortcut.key) {
    return false;
  }
  if (Boolean(event.metaKey) !== Boolean(shortcut.meta)) return false;
  if (Boolean(event.ctrlKey) !== Boolean(shortcut.ctrl)) return false;
  if (Boolean(event.altKey) !== Boolean(shortcut.alt)) return false;
  if (Boolean(event.shiftKey) !== Boolean(shortcut.shift)) return false;
  return true;
}

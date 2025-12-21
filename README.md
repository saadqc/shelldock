# Shelldock

Shelldock is a lightweight Electron desktop SSH client focused on fast, reliable remote terminal workflows. It combines a persistent SSH terminal (xterm.js + node-pty) with any editor like nano/vi or even VS Code–style explorer for browsing remote files over SFTP, running saved commands, and transferring files.

## Screenshots:

<img width="1499" height="813" alt="image" src="https://github.com/user-attachments/assets/a67fca77-c1c3-4a4d-a8a2-9d1cd0a9ec0e" />
<img width="289" height="630" alt="image" src="https://github.com/user-attachments/assets/973cbb32-11d1-404b-9b01-8ccde5a09361" />


## Features

- **SSH host picker**: Loads and parses `~/.ssh/config` (supports `Include` and inline comments).
- **Interactive terminal**: Full shell via `ssh` in a PTY (supports resize and interactive TTY behavior).
- **Remote file explorer**:
  - Lazy-loaded directory tree over SFTP
  - Pagination for huge folders (`pageSize`)
  - Folder click sends `cd <path>` to the active terminal
  - File click opens using configurable “open modes” (remote shell, local download, local command, or `sftp://` URI)
  - File-type icons in the tree
- **Actions panel**:
  - Create / update / delete saved commands
  - Run commands in the active terminal session (optional `cwd`)
  - Upload / download via SFTP with progress
- **Multi-tab sessions**:
  - Multiple SSH tabs (each tab has its own terminal + SFTP session)
  - Optional “restore tabs on launch”
- **Saved + recent locations**:
  - Per-host (only shown when connected to that host)
  - Save from toolbar or right-click a folder in the tree
- **Quality-of-life**:
  - Right-click tree context menu: copy remote path
  - Drag & drop local files into the tree to upload (SFTP)
  - Terminal copy/paste (Cmd/Ctrl+C copies selection, Cmd/Ctrl+V pastes)

## Tech stack

- Electron
- Node.js (>= 18)
- xterm.js
- node-pty
- ssh2 + ssh2-sftp-client

## Project layout

- Main process:
  - `main.js` (entrypoint)
  - `main/app.js` (window + IPC wiring)
  - `main/services/` (SSH config, sessions, stores)
- Renderer:
  - `renderer/index.js` (boot)
  - `renderer/components/` (Files panel, Actions panel, Session tabs)
  - `renderer/services/` (settings, persistence, editor open behavior, icon mapping)
- UI:
  - `index.html` (main window)
  - `settings.html` + `settings.js` (settings window)
- Assets:
  - `assets/icons/` (app icon + file-type icons)

## Settings & persistence

- **Settings file**: `~/.shelldock/settings.json`
- **State file** (commands, known hosts, recents/saved, tab restore data): Electron user data folder
  - macOS: `~/Library/Application Support/Shelldock/state.json`
  - Windows: `%APPDATA%\\Shelldock\\state.json`
  - Linux: `~/.config/Shelldock/state.json`

Settings are stored as nested objects with `{ type, value }` per field.

## Requirements

### Common

- Node.js >= 18
- `ssh` must be available on PATH
- A working SSH config at `~/.ssh/config` (optional, but recommended)

### macOS

- Xcode Command Line Tools (for native module builds):
  - `xcode-select --install`

### Windows

- Windows 10/11
- “Build Tools for Visual Studio” (C++ build tools) for native modules
- OpenSSH client (built-in on modern Windows)

### Linux

- Build essentials for native modules, e.g.:
  - Debian/Ubuntu: `sudo apt-get install -y build-essential python3 make g++`
  - Fedora: `sudo dnf install -y @development-tools python3`
- `openssh-client` installed

## Run locally

```bash
npm install
npm run start:gui
```

Notes:
- `postinstall` runs `electron-builder install-app-deps` to rebuild native modules for Electron.
- If you run into native module build issues, remove `node_modules` and reinstall:
  - `rm -rf node_modules package-lock.json && npm install`

## Build a release (macOS DMG / others)

```bash
npm run dist
```

Outputs go to `dist/`.

This project is **not code-signed** by default. For distribution outside your machine, you’ll want to configure signing + notarization in `package.json`’s `build.mac` settings.

## Usage tips

- **Connect**: pick a host from the dropdown and click Connect.
- **Navigate**:
  - Click a folder in the tree to `cd` into it.
  - Use the path bar to enter a full path and press Enter.
  - Use back/forward buttons to move through directory history.
- **Tree context menu**:
  - Right-click any item → Copy path
  - Right-click a folder → Save folder
- **Drag & drop upload**:
  - Drag local files onto a folder in the tree to upload into that remote folder.
- **Open files**:
  - Controlled by Settings → Editor (mode + file associations).
  - Large-file warning triggers above 2MB (configurable in code).

## Troubleshooting

- **No SSH hosts appear**
  - Confirm `~/.ssh/config` exists and contains `Host <alias>` blocks.
  - Run: `npm run test:ssh-config`
- **SFTP says “Not connected”**
  - SFTP session is created on Connect; check that the SSH host is reachable and auth works.
- **Electron logs SSL handshake errors**
  - These can be normal Chromium background networking logs; Shelldock disables background networking, but some platforms may still emit them.

## License

No license specified.


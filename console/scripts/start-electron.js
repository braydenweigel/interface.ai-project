// Launches the real Electron binary for the main process.
//
// Some host environments (this dev sandbox included) set
// ELECTRON_RUN_AS_NODE=1 ambiently -- Electron honors that by running as
// plain Node instead of the real app runtime, which makes
// require('electron') return the path string instead of the {app,
// BrowserWindow, ipcMain, ...} API and crashes main.ts. Building a fresh
// env object without that key (rather than trying to unset it via
// shell-specific syntax, which differs between cmd.exe and POSIX shells)
// guarantees the child process launches as real Electron regardless of
// how this script itself was invoked.

const path = require('node:path');
const { spawn } = require('node:child_process');

const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const extraArgs = process.env.CONSOLE_DEBUG_PORT
  ? [`--remote-debugging-port=${process.env.CONSOLE_DEBUG_PORT}`]
  : [];

const child = spawn(
  electronPath,
  ['-r', 'tsx/cjs', ...extraArgs, path.join(__dirname, '..', 'electron', 'main.ts')],
  { stdio: 'inherit', env }
);

child.on('exit', (code) => process.exit(code ?? 0));

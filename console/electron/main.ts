// Electron main process (CONSOLE_BUILD_SPEC.md §2).
//
// This is a real Node.js runtime, unlike a Tauri/Rust backend: it imports
// run() from the existing replay system directly and calls it in-process
// -- no child process, no CLI shell-out, no re-parsing of run.ts's own
// stdout. The renderer never gets Node access; it only talks to the two
// IPC handlers below via the preload script's contextBridge.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { run } from '../../src/replay/run';

// console/electron/main.ts -> console/ -> repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts');
const DEV_SERVER_URL = 'http://localhost:5173';

function listArtifactFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listArtifactFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      found.push(fullPath);
    }
  }
  return found;
}

function registerIpcHandlers(): void {
  // Deliverable 1 (artifact picker): a plain recursive read of
  // artifacts/**/*.json -- no schema validation here, run() already does
  // that when a run is actually attempted.
  ipcMain.handle('list-artifacts', () => {
    return listArtifactFiles(ARTIFACTS_DIR).map((filePath) => {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return { path: filePath, data };
      } catch (err) {
        return { path: filePath, data: null, parseError: (err as Error).message };
      }
    });
  });

  // Deliverable 3 (run + result display): run() already validates,
  // replays, writes evidence, and redacts sensitive fields -- the
  // handler forwards its return value to the renderer, plus a base64
  // data URL for the screenshot. The renderer loads http://localhost:5173
  // in dev (and dist/index.html in a packaged build), and Chromium blocks
  // an http(s)/file-origin page from loading a *different*-origin
  // file:// resource -- inlining the bytes over IPC sidesteps that
  // entirely rather than relaxing webSecurity.
  ipcMain.handle(
    'run-artifact',
    async (_event, artifactPath: string, params: Record<string, string | number | boolean>) => {
      const outcome = await run(artifactPath, params ?? {});
      let screenshotDataUrl: string | undefined;
      if (outcome.screenshotPath) {
        try {
          const bytes = fs.readFileSync(outcome.screenshotPath);
          screenshotDataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
        } catch {
          // Leave screenshotDataUrl undefined; the renderer just won't show an image.
        }
      }
      return { ...outcome, screenshotDataUrl };
    }
  );
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (!app.isPackaged) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

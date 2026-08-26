// Preload script — the only bridge between the sandboxed renderer and the
// main process's Node/Playwright access (build-specs/console/1_CONSOLE_SPEC.md §2). The
// renderer never gets nodeIntegration; it only ever sees the narrow API
// exposed here via contextBridge.
//
// Deliberately NOT `window.console` (that would clobber the native
// browser Console API) — exposed as `window.replayApi` instead.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('replayApi', {
  /** @returns {Promise<Array<{path: string, data: unknown, parseError?: string}>>} */
  listArtifacts: () => ipcRenderer.invoke('list-artifacts'),

  /**
   * @param {string} artifactPath
   * @param {Record<string, string | number | boolean>} params
   * @returns {Promise<unknown>} the RunOutcome from src/replay/run.ts
   */
  runArtifact: (artifactPath, params) =>
    ipcRenderer.invoke('run-artifact', artifactPath, params)
});

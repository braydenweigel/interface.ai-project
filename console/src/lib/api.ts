// Typed wrapper around the preload-exposed window.replayApi
// (build-specs/console/1_CONSOLE_SPEC.md §2).
//
// capability-artifact.ts has zero runtime dependencies (no Node imports,
// just plain TS interfaces), so it's imported directly rather than
// redeclared, per build-specs/console/1_CONSOLE_SPEC.md §1. run.ts/engine.ts, by
// contrast, pull in fs/path/playwright/zod -- fine for the main process,
// but not something the renderer's browser-only tsconfig should have to
// type-check. The handful of result-shape types below are small and
// stable enough to mirror locally instead.
import type { CapabilityArtifact } from '../../../src/types/capability-artifact';

export type ReplayLogEntry = {
  time: string;
  stepId: string;
  action: string;
  message: string;
};

export type ReplayResult =
  | { status: 'success'; outputs: Record<string, unknown> }
  | { status: 'business_outcome'; outcome: string; outputs: Record<string, unknown> }
  | { status: 'failure'; stepId: string; expected: string; observed: string };

export interface RunOutcome {
  exitCode: number;
  result: ReplayResult;
  log: ReplayLogEntry[];
  screenshotPath?: string;
  /** Added by the main process's IPC handler -- see electron/main.ts. */
  screenshotDataUrl?: string;
  runId?: string;
  runDir?: string;
}

export interface ArtifactListEntry {
  path: string;
  data: CapabilityArtifact | null;
  parseError?: string;
}

/** One row of the Log tab's list -- cheap summary, no log/outputs/screenshot.
 * See build-specs/console/2_LOG_TAB_SPEC.md §2. */
export interface EvidenceRunSummary {
  runId: string;
  runDir: string;
  capabilityId: string;
  capabilityVersion: string;
  status: ReplayResult['status'];
  /** Run directory's filesystem mtime (ms) -- not parsed out of runId, see spec §2. */
  timestamp: number;
  artifactPath: string;
}

/** Full record for one run, fetched lazily when a Log tab row is opened. */
export interface EvidenceRunDetail {
  evidence: {
    runId: string;
    artifactPath: string;
    capabilityId: string;
    capabilityVersion: string;
    params: Record<string, unknown>;
    result: ReplayResult;
    log: ReplayLogEntry[];
    screenshotPath?: string;
  };
  /** null when the artifact file has since been moved/edited/deleted -- expected, not an error. */
  artifact: CapabilityArtifact | null;
  screenshotDataUrl?: string;
}

export interface ReplayApi {
  listArtifacts: () => Promise<ArtifactListEntry[]>;
  runArtifact: (
    artifactPath: string,
    params: Record<string, string | number | boolean>
  ) => Promise<RunOutcome>;
  listEvidenceRuns: () => Promise<EvidenceRunSummary[]>;
  getEvidenceRun: (runDir: string) => Promise<EvidenceRunDetail>;
}

declare global {
  interface Window {
    replayApi: ReplayApi;
  }
}

export const replayApi: ReplayApi = window.replayApi;

export type { CapabilityArtifact, ParamSpec, OutputSpec, RiskClass } from '../../../src/types/capability-artifact';

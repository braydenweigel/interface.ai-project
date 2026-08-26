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

export interface ReplayApi {
  listArtifacts: () => Promise<ArtifactListEntry[]>;
  runArtifact: (
    artifactPath: string,
    params: Record<string, string | number | boolean>
  ) => Promise<RunOutcome>;
}

declare global {
  interface Window {
    replayApi: ReplayApi;
  }
}

export const replayApi: ReplayApi = window.replayApi;

export type { CapabilityArtifact, ParamSpec, OutputSpec, RiskClass } from '../../../src/types/capability-artifact';

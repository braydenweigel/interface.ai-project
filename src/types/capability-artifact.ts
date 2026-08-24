// Capability-artifact schema — TypeScript types.
// See ARTIFACT_BUILD_SPEC.md §2 and docs/step0-flow-notes.md for the
// design rationale. src/types/artifact-schema.zod.ts is the runtime
// mirror of everything in this file.

export type ParamType = 'string' | 'number' | 'boolean' | 'currency' | 'date';

export interface ParamSpec {
  name: string;
  type: ParamType;
  required: boolean;
  description: string;
  /** Redact this field's value from results and logs. */
  sensitive: boolean;
}

export interface OutputSpec {
  name: string;
  type: ParamType;
  description: string;
  sensitive: boolean;
}

/**
 * A locator is never a single selector — it's an ordered fallback chain.
 * The replay engine tries each strategy in order and uses the first one
 * that resolves to a visible element. `robustnessRationale` is required
 * and must justify *this specific ordering* against the actual markup
 * (see the hand-authored artifact for concrete examples) — not a generic
 * "css is fragile" note.
 */
export type LocatorStrategy =
  | { kind: 'role'; role: string; name?: string; exact?: boolean }
  | { kind: 'testId'; testId: string }
  | { kind: 'label'; label: string; exact?: boolean }
  | { kind: 'text'; text: string; exact?: boolean }
  | { kind: 'css'; selector: string }
  | { kind: 'xpath'; expression: string };

export interface LocatorSpec {
  strategies: LocatorStrategy[];
  robustnessRationale: string;
}

export type StepAction = 'navigate' | 'fill' | 'click' | 'waitFor' | 'extract';
export type FailureClass = 'hard' | 'recoverable';

/**
 * A named, bounded recovery attempt. `detector` describes (in prose) the
 * condition that triggers this hint being tried; `action` is what the
 * engine actually does; `maxAttempts` bounds it so recovery can never
 * become an unbounded retry loop.
 */
export interface RecoveryHint {
  name: string;
  detector: string;
  action: 'retry' | 'retryWithExtendedTimeout' | 'reload' | 'dismissDialog' | 'custom';
  maxAttempts: number;
  /** Required when action === 'retryWithExtendedTimeout'. */
  extendedTimeoutMs?: number;
  note?: string;
}

export interface ArtifactStep {
  id: string;
  action: StepAction;
  description: string;
  /**
   * Ordered chain of iframe locators to descend into before resolving
   * this step's own locator/value. Omitted or [] means "top-level
   * document." Each entry is itself a full fallback-chain LocatorSpec
   * because unlabeled iframes are exactly the kind of element that needs
   * one (see the mock app's main content iframe).
   */
  frame?: LocatorSpec[];
  /** Required for fill / click / waitFor / extract. Absent for navigate. */
  locator?: LocatorSpec;
  /**
   * For `fill`: the value to type, may reference `{{paramName}}`.
   * For `navigate`: the URL to go to, may reference `{{baseUrl}}` and
   * `{{paramName}}`.
   */
  value?: string;
  /** For `extract`: which declared OutputSpec this step's value fills. */
  outputName?: string;
  timeoutMs: number;
  onFailure: FailureClass;
  /** Required (non-empty) when onFailure === 'recoverable'. */
  recoveryHints?: RecoveryHint[];
}

export interface ExpectationSpec {
  kind: 'visible' | 'textContains';
  /** Required when kind === 'textContains'. */
  text?: string;
}

/**
 * The success condition. Checked after all steps complete (and after
 * businessOutcomes) — confirms the flow actually reached the expected
 * state, not just that clicks completed without throwing.
 */
export interface Checkpoint {
  description: string;
  frame?: LocatorSpec[];
  locator: LocatorSpec;
  expectation: ExpectationSpec;
}

/**
 * A first-class sibling of Checkpoint, not an exception path. A named,
 * expected terminal state (e.g. "member not found") with its own
 * detector. Checked *before* the success checkpoint so an expected
 * non-success terminal state is never misreported as a failure.
 */
export interface BusinessOutcome {
  name: string;
  description: string;
  frame?: LocatorSpec[];
  detector: LocatorSpec;
  expectation: ExpectationSpec;
  outputs?: OutputSpec[];
}

export type RiskClass = 'safe' | 'reversible' | 'irreversible';

export interface Provenance {
  createdAt: string;
  createdBy: string;
  sourceRunId?: string;
  reviewedBy?: string;
}

export interface CapabilityTarget {
  appId: string;
  baseUrl: string;
  entryPath: string;
}

export interface CapabilityArtifact {
  schemaVersion: string;
  capabilityId: string;
  version: number;
  description: string;
  target: CapabilityTarget;
  parameters: ParamSpec[];
  outputs: OutputSpec[];
  steps: ArtifactStep[];
  checkpoint: Checkpoint;
  businessOutcomes: BusinessOutcome[];
  riskClass: RiskClass;
  provenance: Provenance;
}

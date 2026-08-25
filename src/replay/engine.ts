// Deterministic replay engine (ARTIFACT_BUILD_SPEC.md §5).
//
// Scope reminder: this is the minimal executor described in the spec, not
// a production replay engine. No guardrail/allowlist enforcement, no
// escalation/handoff -- a hard failure just returns a structured result
// and stops. TODO(future phase): gate riskClass: "irreversible" steps
// behind an approval/guardrail layer before executing them; out of scope
// here per ARTIFACT_BUILD_SPEC.md §6.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type FrameLocator, type Locator } from 'playwright';
import type {
  CapabilityArtifact,
  LocatorSpec,
  LocatorStrategy,
  ArtifactStep,
  ExpectationSpec,
  BusinessOutcome,
  OutputSpec,
  ParamType
} from '../types/capability-artifact';

export type ReplayParams = Record<string, string | number | boolean>;

export type ReplayResult =
  | { status: 'success'; outputs: Record<string, unknown> }
  | { status: 'business_outcome'; outcome: string; outputs: Record<string, unknown> }
  | { status: 'failure'; stepId: string; expected: string; observed: string };

export interface ReplayLogEntry {
  time: string;
  stepId: string;
  action: string;
  message: string;
}

export interface ReplayRunResult {
  result: ReplayResult;
  log: ReplayLogEntry[];
  screenshotPath?: string;
}

export interface ReplayOptions {
  headless?: boolean;
  /** Per-run evidence folder. If set, screenshot.png is written directly into it. */
  evidenceDir?: string;
}

const REDACTED = '[REDACTED]';

// -----------------------------------------------------------------------
// Template context: resolves declared parameters (with type-appropriate
// defaults for missing optional ones) into strings usable in {{param}}
// substitution, and tracks which parameter names are sensitive so log
// lines and results can redact them.
// -----------------------------------------------------------------------

class TemplateContext {
  private readonly stringValues = new Map<string, string>();
  private readonly sensitiveNames = new Set<string>();
  readonly baseUrl: string;

  constructor(artifact: CapabilityArtifact, rawParams: ReplayParams) {
    this.baseUrl = artifact.target.baseUrl;
    for (const spec of artifact.parameters) {
      if (spec.sensitive) this.sensitiveNames.add(spec.name);
      const provided = rawParams[spec.name];
      if (provided === undefined || provided === null || provided === '') {
        if (spec.required) {
          throw new Error(`missing required parameter "${spec.name}"`);
        }
        this.stringValues.set(spec.name, defaultForType(spec.type));
      } else {
        this.stringValues.set(spec.name, stringifyForType(provided, spec.type));
      }
    }
  }

  isSensitive(paramName: string): boolean {
    return this.sensitiveNames.has(paramName);
  }

  /** Does this raw (un-substituted) template string reference any sensitive param? */
  referencesSensitiveParam(template: string): boolean {
    for (const match of template.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) {
      if (this.isSensitive(match[1])) return true;
    }
    return false;
  }

  substitute(template: string): string {
    return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_full, name: string) => {
      if (name === 'baseUrl') return this.baseUrl;
      const value = this.stringValues.get(name);
      if (value === undefined) {
        // Should be unreachable: artifact-schema.zod.ts rejects dangling
        // param references before an artifact ever reaches the engine.
        throw new Error(`unresolved template reference {{${name}}}`);
      }
      return value;
    });
  }

  /** Log-safe version of a raw (un-substituted) template string. */
  redactedPreview(template: string): string {
    return this.referencesSensitiveParam(template) ? REDACTED : this.substitute(template);
  }
}

function defaultForType(type: ParamType): string {
  switch (type) {
    case 'boolean':
      return 'false';
    case 'number':
    case 'currency':
      return '0';
    default:
      return '';
  }
}

function stringifyForType(value: string | number | boolean, type: ParamType): string {
  if (type === 'boolean') return String(value === true || value === 'true');
  return String(value);
}

function coerceExtractedValue(rawText: string, type: ParamType): unknown {
  const trimmed = rawText.trim();
  switch (type) {
    case 'currency':
    case 'number': {
      const numeric = trimmed.replace(/[^0-9.-]/g, '');
      return numeric === '' ? null : Number(numeric);
    }
    case 'boolean':
      return /^(true|yes)$/i.test(trimmed);
    default:
      return trimmed;
  }
}

// -----------------------------------------------------------------------
// Locator resolution: each LocatorSpec is a fallback chain. We try every
// strategy in order and use the first that resolves to a visible element
// within its share of the step's timeout budget.
// -----------------------------------------------------------------------

type Scope = Page | FrameLocator;

function buildLocator(scope: Scope, strategy: LocatorStrategy): Locator {
  switch (strategy.kind) {
    case 'role':
      return scope.getByRole(strategy.role as Parameters<Scope['getByRole']>[0], {
        name: strategy.name,
        exact: strategy.exact
      });
    case 'testId':
      return scope.getByTestId(strategy.testId);
    case 'label':
      return scope.getByLabel(strategy.label, { exact: strategy.exact });
    case 'text':
      return scope.getByText(strategy.text, { exact: strategy.exact });
    case 'css':
      return scope.locator(strategy.selector);
    case 'xpath':
      return scope.locator(`xpath=${strategy.expression}`);
  }
}

function describeStrategy(strategy: LocatorStrategy): string {
  switch (strategy.kind) {
    case 'role':
      return `role=${strategy.role}${strategy.name ? ` name="${strategy.name}"` : ''}`;
    case 'testId':
      return `testId=${strategy.testId}`;
    case 'label':
      return `label="${strategy.label}"`;
    case 'text':
      return `text="${strategy.text}"`;
    case 'css':
      return `css=${strategy.selector}`;
    case 'xpath':
      return `xpath=${strategy.expression}`;
  }
}

export function describeLocatorSpec(spec: LocatorSpec): string {
  return spec.strategies.map(describeStrategy).join(' | ');
}

/** Substitute {{param}} templates into every string field of a LocatorSpec (and nested frame chains). */
function substituteLocatorSpec(spec: LocatorSpec, ctx: TemplateContext): LocatorSpec {
  return {
    robustnessRationale: spec.robustnessRationale,
    strategies: spec.strategies.map((s): LocatorStrategy => {
      switch (s.kind) {
        case 'role':
          return { ...s, name: s.name ? ctx.substitute(s.name) : s.name };
        case 'testId':
          return { ...s, testId: ctx.substitute(s.testId) };
        case 'label':
          return { ...s, label: ctx.substitute(s.label) };
        case 'text':
          return { ...s, text: ctx.substitute(s.text) };
        case 'css':
          return { ...s, selector: ctx.substitute(s.selector) };
        case 'xpath':
          return { ...s, expression: ctx.substitute(s.expression) };
      }
    })
  };
}

interface ResolvedLocator {
  locator: Locator;
  matchedStrategy: string;
}

class LocatorResolutionError extends Error {
  constructor(
    public readonly attempted: string[],
    message: string
  ) {
    super(message);
  }
}

async function resolveLocatorSpec(scope: Scope, spec: LocatorSpec, timeoutMs: number): Promise<ResolvedLocator> {
  const perStrategyTimeout = Math.max(300, Math.floor(timeoutMs / spec.strategies.length));
  const attempted: string[] = [];
  for (const strategy of spec.strategies) {
    const description = describeStrategy(strategy);
    attempted.push(description);
    const locator = buildLocator(scope, strategy);
    try {
      await locator.first().waitFor({ state: 'visible', timeout: perStrategyTimeout });
      return { locator: locator.first(), matchedStrategy: description };
    } catch {
      // Try the next strategy in the fallback chain.
    }
  }
  throw new LocatorResolutionError(
    attempted,
    `no strategy resolved to a visible element (tried: ${attempted.join(' | ')})`
  );
}

async function resolveFrameChain(page: Page, chain: LocatorSpec[] | undefined, timeoutMs: number, ctx: TemplateContext): Promise<Scope> {
  let scope: Scope = page;
  for (const frameSpec of chain ?? []) {
    const substituted = substituteLocatorSpec(frameSpec, ctx);
    const { locator } = await resolveLocatorSpec(scope, substituted, timeoutMs);
    scope = locator.contentFrame();
  }
  return scope;
}

function checkExpectation(text: string, expectation: ExpectationSpec): boolean {
  if (expectation.kind === 'visible') return true;
  return text.includes(expectation.text ?? '');
}

// -----------------------------------------------------------------------
// Step execution
// -----------------------------------------------------------------------

async function executeStepOnce(
  page: Page,
  step: ArtifactStep,
  ctx: TemplateContext,
  outputs: Record<string, unknown>,
  artifact: CapabilityArtifact,
  timeoutMsOverride?: number
): Promise<string> {
  const timeoutMs = timeoutMsOverride ?? step.timeoutMs;

  if (step.action === 'navigate') {
    const url = ctx.substitute(step.value ?? '');
    await page.goto(url, { timeout: timeoutMs });
    return `navigated to ${ctx.redactedPreview(step.value ?? '')}`;
  }

  const scope = await resolveFrameChain(page, step.frame, timeoutMs, ctx);
  const locatorSpec = substituteLocatorSpec(step.locator as LocatorSpec, ctx);
  const { locator, matchedStrategy } = await resolveLocatorSpec(scope, locatorSpec, timeoutMs);

  switch (step.action) {
    case 'fill': {
      const value = ctx.substitute(step.value ?? '');
      await locator.fill(value, { timeout: timeoutMs });
      return `filled via [${matchedStrategy}] with ${ctx.redactedPreview(step.value ?? '')}`;
    }
    case 'click': {
      await locator.click({ timeout: timeoutMs });
      return `clicked via [${matchedStrategy}]`;
    }
    case 'waitFor': {
      return `visible via [${matchedStrategy}]`;
    }
    case 'extract': {
      const text = (await locator.innerText()).trim();
      const outputSpec = artifact.outputs.find((o) => o.name === step.outputName);
      const value = coerceExtractedValue(text, outputSpec?.type ?? 'string');
      outputs[step.outputName as string] = value;
      const preview = outputSpec?.sensitive ? REDACTED : JSON.stringify(value);
      return `extracted "${step.outputName}" = ${preview} via [${matchedStrategy}]`;
    }
    default:
      throw new Error(`unhandled action "${step.action}"`);
  }
}

async function executeStepWithRecovery(
  page: Page,
  step: ArtifactStep,
  ctx: TemplateContext,
  outputs: Record<string, unknown>,
  artifact: CapabilityArtifact,
  log: ReplayLogEntry[]
): Promise<void> {
  try {
    const message = await executeStepOnce(page, step, ctx, outputs, artifact);
    log.push({ time: new Date().toISOString(), stepId: step.id, action: step.action, message });
    return;
  } catch (err) {
    const firstError = err as Error;
    log.push({
      time: new Date().toISOString(),
      stepId: step.id,
      action: step.action,
      message: `attempt 1 failed: ${firstError.message}`
    });

    if (step.onFailure !== 'recoverable' || !step.recoveryHints || step.recoveryHints.length === 0) {
      throw firstError;
    }

    let lastError = firstError;
    for (const hint of step.recoveryHints) {
      for (let attempt = 1; attempt <= hint.maxAttempts; attempt++) {
        log.push({
          time: new Date().toISOString(),
          stepId: step.id,
          action: step.action,
          message: `recovery "${hint.name}" attempt ${attempt}/${hint.maxAttempts}: ${hint.detector}`
        });
        try {
          if (hint.action === 'dismissDialog') {
            page.once('dialog', (d) => void d.dismiss());
          }
          if (hint.action === 'reload') {
            await page.reload({ timeout: hint.extendedTimeoutMs ?? step.timeoutMs });
          }
          const extendedTimeout = hint.action === 'retryWithExtendedTimeout' ? hint.extendedTimeoutMs : undefined;
          const message = await executeStepOnce(page, step, ctx, outputs, artifact, extendedTimeout);
          log.push({
            time: new Date().toISOString(),
            stepId: step.id,
            action: step.action,
            message: `recovered via "${hint.name}": ${message}`
          });
          return;
        } catch (retryErr) {
          lastError = retryErr as Error;
          log.push({
            time: new Date().toISOString(),
            stepId: step.id,
            action: step.action,
            message: `recovery "${hint.name}" attempt ${attempt}/${hint.maxAttempts} failed: ${lastError.message}`
          });
        }
      }
    }
    throw lastError;
  }
}

// -----------------------------------------------------------------------
// Business outcomes + checkpoint
// -----------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 2000;

async function extractOutcomeOutputs(
  scope: Scope,
  outcome: BusinessOutcome,
  matchedLocator: Locator
): Promise<Record<string, unknown>> {
  if (!outcome.outputs || outcome.outputs.length === 0) return {};
  // Minimal convention: a business outcome with declared outputs reads its
  // own detector element's text as the (single) output value. Good enough
  // for the "prove the schema is sound" scope of this deliverable; a
  // richer per-output extraction locator is a natural extension.
  const text = (await matchedLocator.innerText()).trim();
  const output = outcome.outputs[0];
  const value = coerceExtractedValue(text, output.type);
  return { [output.name]: output.sensitive ? REDACTED : value };
}

async function detectBusinessOutcome(
  page: Page,
  artifact: CapabilityArtifact,
  ctx: TemplateContext,
  log: ReplayLogEntry[]
): Promise<{ name: string; outputs: Record<string, unknown> } | null> {
  for (const outcome of artifact.businessOutcomes) {
    try {
      const scope = await resolveFrameChain(page, outcome.frame, PROBE_TIMEOUT_MS, ctx);
      const detectorSpec = substituteLocatorSpec(outcome.detector, ctx);
      const { locator, matchedStrategy } = await resolveLocatorSpec(scope, detectorSpec, PROBE_TIMEOUT_MS);
      const text = (await locator.innerText()).trim();
      if (!checkExpectation(text, outcome.expectation)) continue;
      log.push({
        time: new Date().toISOString(),
        stepId: '(businessOutcome)',
        action: 'detect',
        message: `matched outcome "${outcome.name}" via [${matchedStrategy}]`
      });
      const outputs = await extractOutcomeOutputs(scope, outcome, locator);
      return { name: outcome.name, outputs };
    } catch {
      // This outcome's detector didn't resolve; try the next one.
    }
  }
  return null;
}

async function checkCheckpoint(
  page: Page,
  artifact: CapabilityArtifact,
  ctx: TemplateContext
): Promise<{ ok: boolean; expected: string; observed: string }> {
  const cp = artifact.checkpoint;
  const expected = `${describeLocatorSpec(cp.locator)} to be ${cp.expectation.kind === 'visible' ? 'visible' : `visible and contain "${cp.expectation.text}"`}`;
  try {
    const scope = await resolveFrameChain(page, cp.frame, PROBE_TIMEOUT_MS, ctx);
    const locatorSpec = substituteLocatorSpec(cp.locator, ctx);
    const { locator } = await resolveLocatorSpec(scope, locatorSpec, PROBE_TIMEOUT_MS);
    const text = (await locator.innerText()).trim();
    const ok = checkExpectation(text, cp.expectation);
    return { ok, expected, observed: ok ? text : `element visible but text was "${text}"` };
  } catch (err) {
    return { ok: false, expected, observed: `checkpoint locator did not resolve: ${(err as Error).message}` };
  }
}

function redactOutputs(outputs: Record<string, unknown>, specs: OutputSpec[]): Record<string, unknown> {
  const sensitive = new Set(specs.filter((s) => s.sensitive).map((s) => s.name));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(outputs)) {
    result[key] = sensitive.has(key) ? REDACTED : value;
  }
  return result;
}

function describeExpectedForStep(step: ArtifactStep, ctx: TemplateContext): string {
  if (step.action === 'navigate') return `navigation to complete within ${step.timeoutMs}ms`;
  const substituted = substituteLocatorSpec(step.locator as LocatorSpec, ctx);
  return `${describeLocatorSpec(substituted)} to resolve within ${step.timeoutMs}ms`;
}

// -----------------------------------------------------------------------
// Public entry point
// -----------------------------------------------------------------------

export async function replay(artifact: CapabilityArtifact, rawParams: ReplayParams, opts: ReplayOptions = {}): Promise<ReplayRunResult> {
  const log: ReplayLogEntry[] = [];
  const outputs: Record<string, unknown> = {};
  let result: ReplayResult;

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  async function finalize(): Promise<ReplayRunResult> {
    const screenshotPath = page ? await saveScreenshot(page, opts.evidenceDir) : undefined;
    return { result, log, screenshotPath };
  }

  try {
    browser = await chromium.launch({ headless: opts.headless ?? true });
    context = await browser.newContext();
    page = await context.newPage();

    let ctx: TemplateContext;
    try {
      ctx = new TemplateContext(artifact, rawParams);
    } catch (err) {
      result = { status: 'failure', stepId: '(params)', expected: 'all required parameters provided', observed: (err as Error).message };
      return await finalize();
    }

    for (const step of artifact.steps) {
      try {
        await executeStepWithRecovery(page, step, ctx, outputs, artifact, log);
      } catch (err) {
        const bo = await detectBusinessOutcome(page, artifact, ctx, log);
        if (bo) {
          result = { status: 'business_outcome', outcome: bo.name, outputs: bo.outputs };
          return await finalize();
        }
        result = {
          status: 'failure',
          stepId: step.id,
          expected: describeExpectedForStep(step, ctx),
          observed: (err as Error).message
        };
        return await finalize();
      }
    }

    const bo = await detectBusinessOutcome(page, artifact, ctx, log);
    if (bo) {
      result = { status: 'business_outcome', outcome: bo.name, outputs: bo.outputs };
      return await finalize();
    }

    const cp = await checkCheckpoint(page, artifact, ctx);
    if (!cp.ok) {
      result = { status: 'failure', stepId: '(checkpoint)', expected: cp.expected, observed: cp.observed };
      return await finalize();
    }

    result = { status: 'success', outputs: redactOutputs(outputs, artifact.outputs) };
    return await finalize();
  } finally {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

/** Writes screenshot.png directly into `evidenceDir`, which the caller scopes per-run. */
async function saveScreenshot(page: Page, evidenceDir: string | undefined): Promise<string | undefined> {
  if (!evidenceDir) return undefined;
  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const filePath = path.join(evidenceDir, 'screenshot.png');
    await page.screenshot({ path: filePath });
    return filePath;
  } catch {
    return undefined;
  }
}

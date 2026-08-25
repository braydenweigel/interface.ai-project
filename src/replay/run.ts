// CLI + programmatic entry point for replaying an artifact
// (ARTIFACT_BUILD_SPEC.md §5).
//
// Validates the artifact, replays it against a live browser with the
// given params, prints the structured result, and writes evidence to its
// own folder under /evidence/<runId>/ — result.json (result + log) and
// screenshot.png, both written for every run regardless of outcome.
//
// CLI usage:            tsx src/replay/run.ts <artifact.json> key=value ...
// Programmatic usage:   import { run } from './run';
//                        const outcome = await run('artifacts/test/member-savings-lookup.json', {
//                          memberId: '1001',
//                          username: 'demo.operator',
//                          password: 'demo123'
//                        });
//                        // outcome: { exitCode, result, log, screenshotPath, runId, runDir }
//                        // outcome.result is the same discriminated union engine.replay() returns:
//                        // {status:"success", outputs} | {status:"business_outcome", outcome, outputs}
//                        // | {status:"failure", stepId, expected, observed}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateArtifact } from '../types/artifact-schema.zod';
import { replay, type ReplayParams, type ReplayResult, type ReplayLogEntry } from './engine';
import type { ParamSpec } from '../types/capability-artifact';

/** Everything a caller of run() gets back: the replay outcome itself, plus
 * the exit code and evidence-location bookkeeping that the CLI needs. */
export interface RunOutcome {
  /** 0 on success/business_outcome, 1 on a pre-flight error (bad path, failed schema validation), 2 on a replay failure. */
  exitCode: number;
  result: ReplayResult;
  log: ReplayLogEntry[];
  screenshotPath?: string;
  /** Absent when the run never got past artifact loading/validation. */
  runId?: string;
  runDir?: string;
}

const EVIDENCE_DIR = path.resolve(__dirname, '..', '..', 'evidence');

/** Coerces a param value to the type its ParamSpec declares. Values already
 * of the right JS type (programmatic callers) pass through unchanged;
 * strings (CLI args) are converted. */
function coerceParamValue(raw: string | number | boolean, spec: ParamSpec | undefined): string | number | boolean {
  const type = spec?.type ?? 'string';
  if (type === 'boolean') {
    return typeof raw === 'boolean' ? raw : raw === 'true';
  }
  if (type === 'number' || type === 'currency') {
    return typeof raw === 'number' ? raw : Number(raw);
  }
  return String(raw);
}

/**
 * Validates the artifact at `artifactPath` and replays it with `params`,
 * returning the full outcome (result, log, exit code, evidence paths)
 * rather than exiting the process — so this is callable directly (from
 * tests, from another script, from repl.ts) and the caller gets back
 * exactly what happened, not just a pass/fail number.
 */
export async function run(artifactPath: string, params: Record<string, string | number | boolean> = {}): Promise<RunOutcome> {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  } catch (err) {
    const message = `could not read/parse ${artifactPath}: ${(err as Error).message}`;
    console.error(message);
    return {
      exitCode: 1,
      result: { status: 'failure', stepId: '(artifact)', expected: 'a readable, valid JSON artifact file', observed: message },
      log: []
    };
  }

  const validation = validateArtifact(raw);
  if (!validation.valid) {
    console.error(`artifact failed schema validation (${validation.issues.length} issue(s)):`);
    for (const issue of validation.issues) {
      console.error(`  [${issue.path}] ${issue.message}`);
    }
    const observed = validation.issues.map((i) => `[${i.path}] ${i.message}`).join('; ');
    return {
      exitCode: 1,
      result: { status: 'failure', stepId: '(schema)', expected: 'artifact valid against artifact-schema.zod.ts', observed },
      log: []
    };
  }
  const artifact = validation.artifact!;

  const specByName = new Map(artifact.parameters.map((p) => [p.name, p]));
  const coercedParams: ReplayParams = {};
  for (const [key, value] of Object.entries(params)) {
    coercedParams[key] = coerceParamValue(value, specByName.get(key));
  }

  const runId = `${artifact.capabilityId.replace(/[^a-zA-Z0-9._-]/g, '_')}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const runDir = path.join(EVIDENCE_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const headless = process.env.HEADFUL !== '1';

  const { result, log, screenshotPath } = await replay(artifact, coercedParams, {
    headless,
    evidenceDir: runDir
  });

  console.log(JSON.stringify(result, null, 2));

  const evidenceRecord = {
    runId,
    artifactPath,
    capabilityId: artifact.capabilityId,
    capabilityVersion: artifact.version,
    params: redactParamsForEvidence(coercedParams, artifact.parameters),
    result,
    log,
    screenshotPath
  };
  const resultPath = path.join(runDir, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify(evidenceRecord, null, 2), 'utf-8');
  console.error(`evidence written to ${runDir}`);

  return {
    exitCode: result.status === 'failure' ? 2 : 0,
    result,
    log,
    screenshotPath,
    runId,
    runDir
  };
}

function redactParamsForEvidence(params: ReplayParams, specs: ParamSpec[]): Record<string, unknown> {
  const sensitive = new Set(specs.filter((s) => s.sensitive).map((s) => s.name));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = sensitive.has(key) ? '[REDACTED]' : value;
  }
  return out;
}

/** Parses `<artifact.json> key=value ...` CLI args into run()'s shape. */
function parseCliArgv(argv: string[]): { artifactPath: string; params: Record<string, string> } {
  const [artifactPath, ...rest] = argv;
  if (!artifactPath) {
    throw new Error('usage: run <artifact.json> key=value ...');
  }
  const params: Record<string, string> = {};
  for (const arg of rest) {
    const eq = arg.indexOf('=');
    if (eq === -1) {
      throw new Error(`argument "${arg}" is not in key=value form`);
    }
    params[arg.slice(0, eq)] = arg.slice(eq + 1);
  }
  return { artifactPath, params };
}

async function cli(argv: string[]): Promise<number> {
  let parsed: { artifactPath: string; params: Record<string, string> };
  try {
    parsed = parseCliArgv(argv);
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }
  const outcome = await run(parsed.artifactPath, parsed.params);
  return outcome.exitCode;
}

if (require.main === module) {
  cli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('unexpected error:', err);
      process.exit(1);
    });
}

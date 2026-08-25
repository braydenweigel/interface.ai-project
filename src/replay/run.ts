// CLI: run <artifact.json> key=value ... (ARTIFACT_BUILD_SPEC.md §5).
//
// Validates the artifact, replays it against a live browser with the
// given params, prints the structured result, and writes evidence to its
// own folder under /evidence/<runId>/ — result.json (result + log) and
// screenshot.png, both written for every run regardless of outcome.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateArtifact } from '../types/artifact-schema.zod';
import { replay, type ReplayParams } from './engine';
import type { ParamSpec } from '../types/capability-artifact';

const EVIDENCE_DIR = path.resolve(__dirname, '..', '..', 'evidence');

function coerceParam(raw: string, spec: ParamSpec | undefined): string | number | boolean {
  const type = spec?.type ?? 'string';
  switch (type) {
    case 'boolean':
      return raw === 'true';
    case 'number':
    case 'currency':
      return Number(raw);
    default:
      return raw;
  }
}

function parseKeyValueArgs(args: string[], paramSpecs: ParamSpec[]): ReplayParams {
  const specByName = new Map(paramSpecs.map((p) => [p.name, p]));
  const params: ReplayParams = {};
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq === -1) {
      throw new Error(`argument "${arg}" is not in key=value form`);
    }
    const key = arg.slice(0, eq);
    const value = arg.slice(eq + 1);
    params[key] = coerceParam(value, specByName.get(key));
  }
  return params;
}

async function main(): Promise<void> {
  const [artifactPath, ...rest] = process.argv.slice(2);
  if (!artifactPath) {
    console.error('usage: run <artifact.json> key=value ...');
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  } catch (err) {
    console.error(`could not read/parse ${artifactPath}: ${(err as Error).message}`);
    process.exit(1);
  }

  const validation = validateArtifact(raw);
  if (!validation.valid) {
    console.error(`artifact failed schema validation (${validation.issues.length} issue(s)):`);
    for (const issue of validation.issues) {
      console.error(`  [${issue.path}] ${issue.message}`);
    }
    process.exit(1);
  }
  const artifact = validation.artifact!;

  let params: ReplayParams;
  try {
    params = parseKeyValueArgs(rest, artifact.parameters);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const runId = `${artifact.capabilityId.replace(/[^a-zA-Z0-9._-]/g, '_')}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const runDir = path.join(EVIDENCE_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const headless = process.env.HEADFUL !== '1';

  const { result, log, screenshotPath } = await replay(artifact, params, {
    headless,
    evidenceDir: runDir
  });

  console.log(JSON.stringify(result, null, 2));

  const evidenceRecord = {
    runId,
    artifactPath,
    capabilityId: artifact.capabilityId,
    capabilityVersion: artifact.version,
    params: redactParamsForEvidence(params, artifact.parameters),
    result,
    log,
    screenshotPath
  };
  const resultPath = path.join(runDir, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify(evidenceRecord, null, 2), 'utf-8');
  console.error(`evidence written to ${runDir}`);

  process.exit(result.status === 'failure' ? 2 : 0);
}

function redactParamsForEvidence(params: ReplayParams, specs: ParamSpec[]): Record<string, unknown> {
  const sensitive = new Set(specs.filter((s) => s.sensitive).map((s) => s.name));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = sensitive.has(key) ? '[REDACTED]' : value;
  }
  return out;
}

main().catch((err) => {
  console.error('unexpected error:', err);
  process.exit(1);
});

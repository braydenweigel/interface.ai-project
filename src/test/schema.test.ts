import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateArtifact } from '../types/artifact-schema.zod';

const ARTIFACTS_DIR = path.resolve(__dirname, '..', '..', 'artifacts');

function load(relPath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, relPath), 'utf-8'));
}

test('the hand-authored artifact validates cleanly', () => {
  const result = validateArtifact(load('member-savings-lookup.json'));
  assert.equal(result.valid, true, JSON.stringify(result.issues));
});

test('missing robustnessRationale fails with a specific per-field message', () => {
  const result = validateArtifact(load('broken/missing-rationale.json'));
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((i) => i.path === 'steps.0.locator.robustnessRationale' && /non-empty/.test(i.message)),
    JSON.stringify(result.issues)
  );
});

test('a dangling {{param}} reference fails with a specific per-field message', () => {
  const result = validateArtifact(load('broken/dangling-param-reference.json'));
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((i) => i.path === 'steps.0.value' && /memberId/.test(i.message)),
    JSON.stringify(result.issues)
  );
});

test('a recoverable step with no recoveryHints fails with a specific per-field message', () => {
  const result = validateArtifact(load('broken/recoverable-without-hint.json'));
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((i) => i.path === 'steps.0.recoveryHints' && /recoverable/.test(i.message)),
    JSON.stringify(result.issues)
  );
});

test('a well-formed but nonsensical artifact (unproduced output) fails validation', () => {
  const artifact = load('member-savings-lookup.json') as any;
  const mutated = JSON.parse(JSON.stringify(artifact));
  mutated.outputs.push({ name: 'neverProduced', type: 'string', description: 'x', sensitive: false });
  const result = validateArtifact(mutated);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => /neverProduced/.test(i.message)));
});

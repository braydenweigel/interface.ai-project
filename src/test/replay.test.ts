// Integration test: drives a real Playwright browser against a real
// (locally spawned) instance of target-app. Exercises the three result
// shapes required by ARTIFACT_BUILD_SPEC.md §5's acceptance criteria.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { validateArtifact } from '../types/artifact-schema.zod';
import { replay } from '../replay/engine';

const ROOT = path.resolve(__dirname, '..', '..');
const TARGET_APP_DIR = path.join(ROOT, 'target-app');
const BASE_URL = 'http://localhost:4000';

let serverProcess: ChildProcess | undefined;

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/login`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerUp()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('target-app did not become ready in time');
}

before(async () => {
  if (await isServerUp()) return; // reuse an already-running instance
  serverProcess = spawn(process.execPath, ['server.js'], { cwd: TARGET_APP_DIR, stdio: 'ignore' });
  await waitForServer(10_000);
});

after(async () => {
  serverProcess?.kill();
});

function loadValidArtifact(relPath: string) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', relPath), 'utf-8'));
  const result = validateArtifact(raw);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  return result.artifact!;
}

test('happy path: valid params extract the correct savings balance', async () => {
  const artifact = loadValidArtifact('member-savings-lookup.json');
  const { result } = await replay(artifact, { memberId: '1001', username: 'demo.operator', password: 'demo123' });
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.outputs.savingsBalance, 5230.5);
  }
});

test('business outcome: a nonexistent member id is reported as business_outcome, not failure', async () => {
  const artifact = loadValidArtifact('member-savings-lookup.json');
  const { result } = await replay(artifact, { memberId: '99999', username: 'demo.operator', password: 'demo123' });
  assert.equal(result.status, 'business_outcome');
  if (result.status === 'business_outcome') {
    assert.equal(result.outcome, 'member_not_found');
  }
});

test('hard failure: a locator pointed at a nonexistent element reports a specific stepId', async () => {
  const artifact = loadValidArtifact('member-savings-lookup.demo-broken-locator.json');
  const { result } = await replay(artifact, { memberId: '1001', username: 'demo.operator', password: 'demo123' });
  assert.equal(result.status, 'failure');
  if (result.status === 'failure') {
    assert.equal(result.stepId, 'extract_savings_balance');
    assert.ok(result.observed.length > 0);
  }
});

test('sensitive outputs and params never leak into the returned result', async () => {
  const artifact = loadValidArtifact('member-savings-lookup.json');
  const { result, log } = await replay(artifact, { memberId: '1001', username: 'demo.operator', password: 'super-secret-pw' });
  const serialized = JSON.stringify({ result, log });
  assert.ok(!serialized.includes('super-secret-pw'));
});

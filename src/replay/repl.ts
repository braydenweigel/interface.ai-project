// Interactive loop for repeatedly calling run(artifactPath, params) from
// run.ts within a single process. Exists to exercise (and make useful) the
// fact that run() returns its outcome (result, log, exit code, evidence
// paths) instead of calling process.exit() -- so it can be called over and
// over without tearing the process down between runs, unlike the one-shot
// `tsx src/replay/run.ts ...` CLI.
//
// Usage: tsx src/replay/repl.ts
// Each line is parsed into (artifactPath, params) and passed straight to
// run(artifactPath, params), e.g.:
//   artifacts/test/member-savings-lookup.json memberId=1001 username=demo.operator password=demo123
// Blank lines are ignored. Type "exit", "quit", or press Ctrl+D to stop.

import * as readline from 'node:readline';
import { run } from './run';

function parseLine(line: string): { artifactPath: string; params: Record<string, string> } {
  // Supports single/double-quoted args (e.g. password="has a space") in
  // addition to plain whitespace-separated key=value tokens.
  const matches = line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const tokens = matches.map((token) => token.replace(/^(["'])(.*)\1$/, '$2'));
  const [artifactPath, ...rest] = tokens;
  const params: Record<string, string> = {};
  for (const token of rest) {
    const eq = token.indexOf('=');
    if (eq === -1) throw new Error(`argument "${token}" is not in key=value form`);
    params[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return { artifactPath, params };
}

async function repl(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Piped/non-interactive input (tests, scripts) hits EOF as soon as it's
  // all been written, which closes `rl` before we get a chance to call
  // rl.prompt() again for the next line -- so the prompt itself is only
  // ever written directly to stdout, never via rl.prompt().
  const interactive = process.stdin.isTTY === true;
  const showPrompt = () => {
    if (interactive) process.stdout.write('replay> ');
  };

  console.log('Capability-artifact replay REPL.');
  console.log('Each line: <artifact.json> key=value ... (same args as `tsx src/replay/run.ts`).');
  console.log('Type "exit" or "quit" (or Ctrl+D) to stop.\n');

  showPrompt();
  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (line === '') {
      showPrompt();
      continue;
    }
    if (line === 'exit' || line === 'quit') {
      break;
    }

    try {
      const { artifactPath, params } = parseLine(line);
      const outcome = await run(artifactPath, params);
      console.log(`(exit code: ${outcome.exitCode})\n`);
    } catch (err) {
      console.error('unexpected error:', err, '\n');
    }
    showPrompt();
  }

  rl.close();
  console.log('bye');
}

async function testrun(): Promise<void> {
  const outcome = await run('artifacts/test/member-savings-lookup.json', { memberId: '1002', username: 'demo.operator', password: 'demo123' });
  if (outcome.result.status === 'success') {
    console.log(outcome.result.outputs.savingsBalance); // 5230.5
  }
 
}

//repl();
testrun();




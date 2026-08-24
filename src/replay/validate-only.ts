// CLI: schema-validate an artifact with no browser involved, for a fast
// iteration loop while hand-authoring (ARTIFACT_BUILD_SPEC.md §5).
//
// Usage: tsx src/replay/validate-only.ts <artifact.json>

import * as fs from 'node:fs';
import { validateArtifact } from '../types/artifact-schema.zod';

function main(): void {
  const artifactPath = process.argv[2];
  if (!artifactPath) {
    console.error('usage: validate-only <artifact.json>');
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  } catch (err) {
    console.error(`could not read/parse ${artifactPath}: ${(err as Error).message}`);
    process.exit(1);
  }

  const result = validateArtifact(raw);
  if (result.valid) {
    const artifact = result.artifact!;
    console.log(`VALID  ${artifactPath}`);
    console.log(`  capabilityId: ${artifact.capabilityId} v${artifact.version}`);
    console.log(`  steps: ${artifact.steps.length}, businessOutcomes: ${artifact.businessOutcomes.length}, riskClass: ${artifact.riskClass}`);
    process.exit(0);
  }

  console.error(`INVALID  ${artifactPath}  (${result.issues.length} issue${result.issues.length === 1 ? '' : 's'})`);
  for (const issue of result.issues) {
    console.error(`  [${issue.path}] ${issue.message}`);
  }
  process.exit(1);
}

main();

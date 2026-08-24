// Removes everything inside /evidence, keeping the directory itself.
// Usage: node scripts/clear-evidence.js

const fs = require('node:fs');
const path = require('node:path');

const evidenceDir = path.resolve(__dirname, '..', 'evidence');

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  console.log(`created empty ${evidenceDir}`);
  process.exit(0);
}

const entries = fs.readdirSync(evidenceDir).filter((name) => name !== '.gitkeep');
for (const name of entries) {
  fs.rmSync(path.join(evidenceDir, name), { recursive: true, force: true });
}

console.log(`cleared ${entries.length} item(s) from ${evidenceDir}`);

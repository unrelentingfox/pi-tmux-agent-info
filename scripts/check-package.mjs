import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const expected = [
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "RELEASING.md",
  "config.ts",
  "index.ts",
  "package.json",
  "status.ts",
  "triggers/index.ts",
  "triggers/pi.ts",
  "triggers/protocol.ts",
  "triggers/types.ts",
];

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
});
const [result] = JSON.parse(output);
const actual = result.files.map(({ path }) => path).sort();

assert.deepEqual(actual, expected, "npm package contents changed");
console.log(`Verified ${actual.length} package files.`);

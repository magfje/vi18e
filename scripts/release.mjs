#!/usr/bin/env node
/**
 * Release helper — bumps package.json version, commits, tags, and pushes.
 *
 * Usage:
 *   bun run release patch   →  0.1.0 → 0.1.1
 *   bun run release minor   →  0.1.0 → 0.2.0
 *   bun run release major   →  0.1.0 → 1.0.0
 *   bun run release 1.2.3   →  sets an explicit version
 *
 * Pushing the tag triggers the GitHub Actions release workflow.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const bump = process.argv[2];
if (!bump) {
  console.error("Usage: bun run release <patch|minor|major|x.y.z>");
  process.exit(1);
}

function nextVersion(current, type) {
  if (/^\d+\.\d+\.\d+$/.test(type)) return type; // explicit
  const [maj, min, pat] = current.split(".").map(Number);
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  if (type === "patch") return `${maj}.${min}.${pat + 1}`;
  console.error(`Unknown bump type "${type}". Use patch, minor, major, or x.y.z`);
  process.exit(1);
}

const prev = pkg.version;
const next = nextVersion(prev, bump);

// Sanity check — make sure working tree is clean before we do anything
try {
  const dirty = execSync("git status --porcelain").toString().trim();
  if (dirty) {
    console.error("Working tree has uncommitted changes. Commit or stash them first.");
    process.exit(1);
  }
} catch {
  console.error("git not found or not inside a repository.");
  process.exit(1);
}

// Bump package.json
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`\n  ${prev}  →  ${next}\n`);

const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });

run("git add package.json");
run(`git commit -m "chore: release v${next}"`);
run(`git tag v${next}`);

console.log(`\nTagged v${next}. Pushing to origin…\n`);
run("git push");
run("git push --tags");

console.log(`\n✓ v${next} pushed — GitHub Actions will build and draft the release.\n`);

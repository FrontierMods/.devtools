/**
 * @file End-to-end install lifecycle against a temp config file.
 */

import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { readGlobalConfig, writeGlobalConfig } from "../../config/global.ts";
import { toCanonicalPath } from "../../file/paths.ts";
import {
	gamePaths,
	hashFromInstall,
	listInstalls,
	resolveInstall,
} from "../installs.ts";
import { isObject } from "../../types/guards.ts";

/**
 * Commit SHA for the first synthetic install in the lifecycle.
 */
const SHA_A = "27939e29b8b4ddc081490d9f51de59a459c88df6";

/**
 * Commit SHA for the second synthetic install in the lifecycle.
 */
const SHA_B = "0123456789abcdef0123456789abcdef01234567";

/**
 * Builds a minimal `VERSION.txt` body carrying the given commit SHA.
 */
function versionBody(sha: string): string {
	return `build number: 2026-06-06-1535\ncommit sha: ${sha}\n`;
}

/**
 * Creates a temp install directory with a `VERSION.txt` for the given SHA.
 */
function installDir(sha: string): string {
	const dir = mkdtempSync(path.join(tmpdir(), "frontier-install-"));

	writeFileSync(path.join(dir, "VERSION.txt"), versionBody(sha));

	return dir;
}

/**
 * Returns a fresh, non-existent config file path inside a temp directory.
 */
function tempConfigFile(): string {
	return path.join(
		mkdtempSync(path.join(tmpdir(), "frontier-config-")),
		"config.json",
	);
}

test("install lifecycle: add, list, resolve, error, remove", () => {
	const file = tempConfigFile();
	const installA = installDir(SHA_A);
	const installB = installDir(SHA_B);

	// add (the `game add` flow: read, traverse, mutate, write once)
	const config = readGlobalConfig(file);
	const paths = gamePaths(config);

	for (const install of [installA, installB])
		paths[hashFromInstall(install)] = toCanonicalPath(install);

	writeGlobalConfig(config, file);

	// list
	expect(listInstalls(file)).toEqual([
		{ sha: SHA_A, path: toCanonicalPath(installA) },
		{ sha: SHA_B, path: toCanonicalPath(installB) },
	]);

	// resolve by hash
	expect(resolveInstall(SHA_B, file)).toBe(toCanonicalPath(installB));

	// many-install fallback error
	expect(() => resolveInstall(undefined, file)).toThrow(/multiple/i);

	// remove A (native delete + prune + write), then the remaining one auto-resolves
	const fresh = readGlobalConfig(file);
	const game = fresh.game;

	if (isObject(game) && isObject(game.path)) delete game.path[SHA_A];

	writeGlobalConfig(fresh, file);

	expect(listInstalls(file)).toEqual([
		{ sha: SHA_B, path: toCanonicalPath(installB) },
	]);
	expect(resolveInstall(undefined, file)).toBe(toCanonicalPath(installB));
});

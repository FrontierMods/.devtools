/**
 * @file Runtime behavior of install hashing, listing, and resolution.
 */

import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { ConfigError } from "../../config/error.ts";
import { writeGlobalConfig } from "../../config/global.ts";
import {
	discoverInstalls,
	hashFromInstall,
	listInstalls,
	resolveGamePath,
	resolveInstall,
} from "../installs.ts";
import { toCanonicalPath } from "../../file/paths.ts";
import type { FinderResult } from "sysfind";

/**
 * Primary commit SHA used across the install-resolution tests.
 */
const SHA = "27939e29b8b4ddc081490d9f51de59a459c88df6";

/**
 * A second commit SHA, for multi-install and ambiguity cases.
 */
const OTHER = "0123456789abcdef0123456789abcdef01234567";

/**
 * Platform-absolute install path: `C:/...` is only absolute on Windows, so POSIX uses a rooted path.
 */
const GAME_PATH =
	process.platform === "win32" ? "C:/Games/CDDA" : "/Games/CDDA";

/**
 * A second platform-absolute install path, for multi-install cases.
 */
const ALT_PATH = process.platform === "win32" ? "D:/cdda-exp" : "/opt/cdda-exp";

/**
 * Platform-absolute working directory for path-candidate resolution.
 */
const CWD = process.platform === "win32" ? "C:/work" : "/work";

/**
 * A realistic `VERSION.txt` body carrying {@link SHA}, for hash extraction.
 */
const VERSION_BODY =
	`build type: windows-with-graphics-and-sounds-x64\n` +
	`build number: 2026-06-06-1535\n` +
	`commit sha: ${SHA}\n` +
	`commit url: https://github.com/CleverRaven/Cataclysm-DDA/commit/${SHA}\n`;

/**
 * Returns a fresh, non-existent config file path inside a temp directory.
 */
function tempConfigFile(): string {
	return path.join(
		mkdtempSync(path.join(tmpdir(), "frontier-config-")),
		"config.json",
	);
}

/**
 * Creates a temp install directory, writing `VERSION.txt` only when `body` is non-null.
 */
function installDir(body: string | null): string {
	const dir = mkdtempSync(path.join(tmpdir(), "frontier-install-"));

	if (body !== null) writeFileSync(path.join(dir, "VERSION.txt"), body);

	return dir;
}

/**
 * Seeds a config file with a `game.path` map of hash to install path.
 */
function seed(file: string, paths: Record<string, string>): void {
	writeGlobalConfig({ game: { path: paths } }, file);
}

test("hashFromInstall extracts the commit sha from VERSION.txt", () => {
	expect(hashFromInstall(installDir(VERSION_BODY))).toBe(SHA);
});

test("hashFromInstall throws when VERSION.txt is missing", () => {
	expect(() => hashFromInstall(installDir(null))).toThrow(ConfigError);
});

test("hashFromInstall throws when the commit sha line is absent", () => {
	expect(() =>
		hashFromInstall(installDir("build number: 2026-06-06-1535\n")),
	).toThrow(ConfigError);
});

test("hashFromInstall throws when the directory does not exist", () => {
	expect(() =>
		hashFromInstall(path.join(tmpdir(), "frontier-missing-zzz")),
	).toThrow(ConfigError);
});

test("listInstalls reads the game.path object", () => {
	const file = tempConfigFile();

	seed(file, { [SHA]: GAME_PATH });

	expect(listInstalls(file)).toEqual([
		{ sha: SHA, path: toCanonicalPath(GAME_PATH) },
	]);
});

test("resolveInstall auto-uses the only install when no ref is given", () => {
	const file = tempConfigFile();

	seed(file, { [SHA]: GAME_PATH });

	expect(resolveInstall(undefined, file)).toBe(toCanonicalPath(GAME_PATH));
});

test("resolveInstall requires a ref when multiple installs exist", () => {
	const file = tempConfigFile();

	seed(file, { [SHA]: GAME_PATH, [OTHER]: ALT_PATH });

	expect(() => resolveInstall(undefined, file)).toThrow(/multiple/i);
	expect(resolveInstall(OTHER, file)).toBe(toCanonicalPath(ALT_PATH));
});

test("resolveInstall throws when no installs exist", () => {
	expect(() => resolveInstall(undefined, tempConfigFile())).toThrow(
		/no game install/i,
	);
});

test("resolveGamePath resolves an absolute path candidate as-is", () => {
	expect(resolveGamePath({ game: GAME_PATH, cwd: CWD })).toBe(
		toCanonicalPath(GAME_PATH),
	);
});

test("resolveGamePath resolves a relative path candidate against cwd", () => {
	expect(resolveGamePath({ game: "cdda", cwd: CWD })).toBe(
		toCanonicalPath(path.join(CWD, "cdda")),
	);
});

test("resolveGamePath looks up a sha candidate in the installs", () => {
	const file = tempConfigFile();

	seed(file, { [SHA]: GAME_PATH });

	expect(resolveGamePath({ game: SHA, cwd: CWD, file })).toBe(
		toCanonicalPath(GAME_PATH),
	);
});

test("resolveGamePath with no candidate falls back to the sole install", () => {
	const file = tempConfigFile();

	seed(file, { [SHA]: GAME_PATH });

	expect(resolveGamePath({ cwd: CWD, file })).toBe(
		toCanonicalPath(GAME_PATH),
	);
});

/**
 * Builds a stub finder that resolves to the given paths as fake matches.
 */
function fakeFinder(paths: string[]): () => Promise<FinderResult> {
	const matches = paths.map((filePath) => ({
		path: filePath,
		provider: "fake",
	}));

	return () => Promise.resolve({ matches, provider: "fake", trace: [] });
}

test("discoverInstalls registers a single-candidate hash without prompting", async () => {
	const file = tempConfigFile();
	const install = installDir(VERSION_BODY);
	const exe = path.join(install, "cataclysm-tiles.exe");

	let prompted = false;

	const found = await discoverInstalls({
		find: fakeFinder([exe]),
		choose: async () => {
			prompted = true;

			return 0;
		},
		file,
	});

	expect(prompted).toBe(false);
	expect(found).toEqual([{ sha: SHA, path: toCanonicalPath(install) }]);
	expect(listInstalls(file)).toEqual([
		{ sha: SHA, path: toCanonicalPath(install) },
	]);
});

test("discoverInstalls prompts to pick one path among duplicates for a hash", async () => {
	const file = tempConfigFile();
	const primary = installDir(VERSION_BODY);
	const backup = installDir(VERSION_BODY);

	const found = await discoverInstalls({
		find: fakeFinder([
			path.join(primary, "cataclysm-tiles.exe"),
			path.join(backup, "cataclysm-tiles.exe"),
		]),
		choose: async (_sha, candidates) =>
			candidates.indexOf(toCanonicalPath(backup)),
		file,
	});

	expect(found).toEqual([{ sha: SHA, path: toCanonicalPath(backup) }]);
});

test("discoverInstalls skips an install whose VERSION.txt is unparseable", async () => {
	const file = tempConfigFile();
	const good = installDir(VERSION_BODY);
	const bad = installDir("no sha here\n");

	const found = await discoverInstalls({
		find: fakeFinder([
			path.join(good, "cataclysm-tiles.exe"),
			path.join(bad, "cataclysm-tiles.exe"),
		]),
		choose: async () => 0,
		file,
	});

	expect(found).toEqual([{ sha: SHA, path: toCanonicalPath(good) }]);
});

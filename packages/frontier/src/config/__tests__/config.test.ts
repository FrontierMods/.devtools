/**
 * @file Unit tests for game-path resolution precedence.
 */

import { test, expect, mock, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { resolveConfig } from "../config.ts";
import * as installs from "../../game/installs.ts";

/**
 * The slice of the installs module these tests stub out.
 */
interface InstallsMock {
	resolveInstall: () => string;
}

/**
 * A representative commit hash used as a registered install key.
 */
const SHA = "27939e29b8b4ddc081490d9f51de59a459c88df6";

// * Bun's `mock.module` is global and persists across files; restore the real module afterward.

/**
 * Snapshot of the real installs module, restored after the suite.
 */
const REAL_INSTALLS = { ...installs };

afterAll(() => {
	void mock.module("../../game/installs.ts", () => REAL_INSTALLS);
});

/**
 * Create a temp mod dir whose `frontier.json5` optionally declares a relative game path.
 */
function modDirWithGame(relativeGame: string | null): string {
	const cwd = mkdtempSync(path.join(tmpdir(), "frontier-mod-"));
	const body = relativeGame ? [{ game: { path: relativeGame } }] : [{}];

	writeFileSync(path.join(cwd, "frontier.json5"), JSON.stringify(body));

	return cwd;
}

/**
 * Create an existing temp directory under `prefix`, standing in for an install path.
 */
function existingDir(prefix: string): string {
	return mkdtempSync(path.join(tmpdir(), prefix));
}

test("CLI path flag wins over mod and global", () => {
	void mock.module(
		"../../game/installs.ts",
		(): InstallsMock => ({
			resolveInstall: (): string => "/global/game",
		}),
	);

	const cwd = modDirWithGame("./mod-game");
	const cliGame = existingDir("frontier-cli-game-");

	const config = resolveConfig({
		cwd,
		flags: { cache: true, game: cliGame },
	});

	expect(config.paths.game).toContain(path.basename(cliGame));
});

test("a CLI --game hash resolves through the installs registry", () => {
	const registered = existingDir("frontier-registered-game-");

	void mock.module(
		"../../game/installs.ts",
		(): InstallsMock => ({
			resolveInstall: (): string => registered,
		}),
	);

	const cwd = modDirWithGame(null);

	const config = resolveConfig({ cwd, flags: { cache: true, game: SHA } });

	expect(config.paths.game).toContain(path.basename(registered));
});

test("mod game.path is used when no CLI flag is given", () => {
	void mock.module(
		"../../game/installs.ts",
		(): InstallsMock => ({
			resolveInstall: (): string => "/global/game",
		}),
	);

	const cwd = modDirWithGame("./mod-game");

	const config = resolveConfig({ cwd, flags: { cache: true } });

	expect(config.paths.game).toContain("mod-game");
});

test("the installs fallback is used when mod omits a path", () => {
	const globalGame = existingDir("frontier-global-game-");

	void mock.module(
		"../../game/installs.ts",
		(): InstallsMock => ({
			resolveInstall: (): string => globalGame,
		}),
	);

	const cwd = modDirWithGame(null);

	const config = resolveConfig({ cwd, flags: { cache: true } });

	expect(config.paths.game).toContain(path.basename(globalGame));
});

test("resolution surfaces the installs error when nothing is configured", () => {
	void mock.module(
		"../../game/installs.ts",
		(): InstallsMock => ({
			resolveInstall: (): string => {
				throw new Error(
					"No game install configured. Run `frontier game discover`...",
				);
			},
		}),
	);

	const cwd = modDirWithGame(null);

	expect(() => resolveConfig({ cwd, flags: { cache: true } })).toThrow(
		/game discover/,
	);
});

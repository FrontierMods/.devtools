/**
 * @file Unit tests for the object-only global config store.
 */

import { test, expect } from "bun:test";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { ConfigError } from "../error.ts";
import {
	clearGlobalConfig,
	readGlobalConfig,
	validateConfig,
	writeGlobalConfig,
} from "../global.ts";

/**
 * A representative commit hash used as a game-path key.
 */
const SHA = "27939e29b8b4ddc081490d9f51de59a459c88df6";

/**
 * Path to a fresh `config.json` inside a unique temp directory.
 */
function tempConfigFile(): string {
	return path.join(
		mkdtempSync(path.join(tmpdir(), "frontier-config-")),
		"config.json",
	);
}

test("reading an absent config returns an empty object", () => {
	expect(readGlobalConfig(tempConfigFile())).toEqual({});
});

test("write then read round-trips a validated object", () => {
	const file = tempConfigFile();
	const tree = { game: { path: { [SHA]: "C:/Games/CDDA" } } };

	writeGlobalConfig(tree, file);

	expect(readGlobalConfig(file)).toEqual(tree);
});

test("validateConfig rejects a non-string leaf under a known namespace", () => {
	expect(() => validateConfig({ game: { path: { [SHA]: 123 } } })).toThrow(
		ConfigError,
	);
});

test("an unknown namespace passes validation untouched", () => {
	expect(() =>
		validateConfig({ telemetry: { enabled: true } }),
	).not.toThrow();
});

test("clear empties the config but keeps the file", () => {
	const file = tempConfigFile();

	writeGlobalConfig({ game: { path: { [SHA]: "C:/Games/CDDA" } } }, file);
	clearGlobalConfig(file);

	expect(readGlobalConfig(file)).toEqual({});
	expect(existsSync(file)).toBe(true);
});

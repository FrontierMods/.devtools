/**
 * @file Tests for the schema artifact path conventions and the sync pin.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
	modSchemaPaths,
	readSchemaPin,
	storeEntryDir,
	writeSchemaPin,
} from "../paths.ts";

describe("storeEntryDir", () => {
	test("keys by commit under the cache root", () => {
		expect(storeEntryDir("abc123", "/cache")).toBe(
			path.join("/cache", "abc123", "derived"),
		);
	});
});

describe("modSchemaPaths", () => {
	test("lives under the mod's .frontier directory", () => {
		const paths = modSchemaPaths("/mods/MyMod");

		expect(paths.schema).toContain(path.join(".frontier", "schema.json"));
		expect(paths.types).toContain(path.join(".frontier", "game.ts"));
		expect(paths.pin).toContain(path.join(".frontier", "schema.lock.json"));
	});
});

describe("schema pin", () => {
	test("round-trips and reports null when absent", () => {
		const modRoot = mkdtempSync(path.join(tmpdir(), "pin-"));

		expect(readSchemaPin(modRoot)).toBeNull();

		writeSchemaPin(modRoot, {
			commit: "abc123",
			toolkitVersion: "0.1.0",
			syncedAt: "2026-06-12T00:00:00.000Z",
		});

		expect(readSchemaPin(modRoot)?.commit).toBe("abc123");
	});
});

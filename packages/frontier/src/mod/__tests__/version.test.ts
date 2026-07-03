/**
 * @file Tests for mod version validation, increments, and `modinfo.json` rewriting.
 */

import { JSON5 } from "bun";
import { describe, expect, test } from "bun:test";
import { ModVersionError } from "../error.ts";
import {
	isVersion,
	getNextVersion,
	readVersion,
	toModVersion,
	writeVersion,
} from "../version.ts";

/**
 * A fixture in the Frontier Mods' `modinfo.json` format.
 */
const FRONTIER_FORMAT = `[
	{
		"id": "sample",
		"type": "MOD_INFO",
		"version": "v0.3.0",

		"name": "Sample",
		"description": "A sample mod. Note: 'version' appears here.",

		"dependencies": ["dda"],

		"path": "json"
	}
]`;

/**
 * A whole-mod-in-one-file fixture: `MOD_INFO` alongside other game objects.
 * You know who you are.
 */
const WHOLE_MOD = `[
	{
		"type": "MOD_INFO",
		"id": "compact",
		"name": "Compact",
		"version": "v1.0.0"
	},
	{
		"type": "MONSTER",
		"id": "mon_zombie_clerk",
		"name": "zombie clerk"
	}
]`;

/**
 * A fixture with no `version` field.
 */
const VERSIONLESS = `[
	{
		"id": "fresh",
		"type": "MOD_INFO",
		"name": "Fresh Mod"
	}
]`;

describe("isVersion", () => {
	test("accepts SemVer with and without the v prefix", () => {
		expect(isVersion("v0.1.0")).toBe(true);
		expect(isVersion("0.1.0")).toBe(true);
		expect(isVersion("v1.2.3-rc.1")).toBe(true);
		expect(isVersion("2.0.0-alpha.3+build.7")).toBe(true);
	});

	test("rejects what semver rejects", () => {
		expect(isVersion("v0.3")).toBe(false);
		expect(isVersion("1.2.3junk")).toBe(false);
		expect(isVersion("vv1.2.3")).toBe(false);
	});
});

describe("toModVersion", () => {
	test("canonicalizes both shapes to the v prefix", () => {
		expect(toModVersion("1.2.3")).toBe("v1.2.3");
		expect(toModVersion("v1.2.3")).toBe("v1.2.3");
	});

	test("preserves prerelease and build metadata", () => {
		expect(toModVersion("2.0.0-alpha.3+build.7")).toBe(
			"v2.0.0-alpha.3+build.7",
		);
	});

	test("trims whitespace, exactly as semver does", () => {
		expect(toModVersion(" 1.2.3 ")).toBe("v1.2.3");
	});

	test("throws on what semver rejects", () => {
		expect(() => toModVersion("0.3")).toThrow(ModVersionError);
		expect(() => toModVersion("vv1.2.3")).toThrow(ModVersionError);
	});
});

describe("nextVersion", () => {
	test("defaults an omitted kind to patch and keeps the v prefix", () => {
		expect(getNextVersion("v1.2.3")).toBe("v1.2.4");
	});

	test("passes kind and identifier through to semver", () => {
		expect(getNextVersion("v1.2.3", "prepatch", "alpha")).toBe(
			"v1.2.4-alpha.0",
		);
	});

	test("initializes a missing version to v0.1.0 when the kind is omitted", () => {
		expect(getNextVersion(undefined)).toBe("v0.1.0");
	});

	test("increments a missing version from v0.0.0 for explicit kinds", () => {
		expect(getNextVersion(undefined, "patch")).toBe("v0.0.1");
		expect(getNextVersion(undefined, "major")).toBe("v1.0.0");
	});

	test("rejects an identifier on non-prerelease kinds", () => {
		expect(() => getNextVersion("v1.2.3", "patch", "alpha")).toThrow(
			ModVersionError,
		);
		expect(() => getNextVersion("v1.2.3", undefined, "alpha")).toThrow(
			ModVersionError,
		);
	});

	test("translates an impossible increment into ModVersionError", () => {
		expect(() => getNextVersion("v1.2.3", "release")).toThrow(ModVersionError);
	});

	test("canonicalizes a bare stored version while bumping", () => {
		expect(getNextVersion("1.2.3")).toBe("v1.2.4");
	});

	test("rejects a malformed stored version", () => {
		expect(() => getNextVersion("0.3", "patch")).toThrow(ModVersionError);
		expect(() => getNextVersion("v0.3", "patch")).toThrow(ModVersionError);
	});
});

describe("readVersion", () => {
	test("reads the version from a hand-formatted file", () => {
		expect(readVersion(FRONTIER_FORMAT)).toBe("v0.3.0");
	});

	test("reads the MOD_INFO version in a whole-mod file", () => {
		expect(readVersion(WHOLE_MOD)).toBe("v1.0.0");
	});

	test("returns undefined when the field is absent", () => {
		expect(readVersion(VERSIONLESS)).toBeUndefined();
	});

	test("throws when no MOD_INFO object exists", () => {
		const noModInfo = `[{ "type": "MONSTER", "id": "mon_x", "name": "x" }]`;

		expect(() => readVersion(noModInfo)).toThrow(ModVersionError);
	});

	test("throws on multiple MOD_INFO objects", () => {
		const doubled = `[
			{ "type": "MOD_INFO", "id": "one", "name": "One" },
			{ "type": "MOD_INFO", "id": "two", "name": "Two" }
		]`;

		expect(() => readVersion(doubled)).toThrow(ModVersionError);
	});

	test("throws on a non-string version value", () => {
		const numeric = `[{ "type": "MOD_INFO", "id": "x", "name": "X", "version": 3 }]`;

		expect(() => readVersion(numeric)).toThrow(ModVersionError);
	});

	test("throws on a malformed file", () => {
		expect(() => readVersion("not json at all")).toThrow(ModVersionError);
		expect(() => readVersion(`[{ type: "MOD_INFO", "id": "x" }]`)).toThrow(
			ModVersionError,
		);
	});
});

describe("writeVersion", () => {
	test("replaces the version and nothing else", () => {
		expect(writeVersion(FRONTIER_FORMAT, "v0.4.0")).toBe(
			FRONTIER_FORMAT.replace('"v0.3.0"', '"v0.4.0"'),
		);
	});

	test("rewrites only within MOD_INFO when other objects share the file", () => {
		expect(writeVersion(WHOLE_MOD, "v1.1.0")).toBe(
			WHOLE_MOD.replace('"v1.0.0"', '"v1.1.0"'),
		);
	});

	test("inserts after the type line, inheriting indentation", () => {
		const expected = `[
	{
		"id": "fresh",
		"type": "MOD_INFO",
		"version": "v0.1.0",
		"name": "Fresh Mod"
	}
]`;

		expect(writeVersion(VERSIONLESS, "v0.1.0")).toBe(expected);
	});

	test("inserts validly when type is the last field", () => {
		const typeLast = `[
	{
		"id": "tail",
		"name": "Tail",
		"type": "MOD_INFO"
	}
]
`;

		const rewritten = writeVersion(typeLast, "v0.1.0");
		const parsed: unknown = JSON5.parse(rewritten);

		expect(parsed).toEqual([
			{ id: "tail", name: "Tail", type: "MOD_INFO", version: "v0.1.0" },
		]);
	});

	test("throws on a malformed file", () => {
		expect(() => writeVersion("not json", "v0.1.0")).toThrow(
			ModVersionError,
		);
	});
});

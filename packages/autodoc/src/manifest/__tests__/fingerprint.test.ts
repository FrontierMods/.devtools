/**
 * @file Tests manifest fingerprints: aggregate fingerprints are order-independent and change-sensitive, environment fingerprints react to transformer and config changes.
 */

import { describe, expect, test } from "bun:test";
import type { CanonicalPath, FileMetadata } from "@frmds/frontier";
import {
	aggregateFingerprint,
	environmentFingerprint,
} from "../fingerprint.ts";

/**
 * Sample transformer identities for environment fingerprints.
 */
const TRANSFORMERS = [
	{ name: "math", version: "1.0.0" },
	{ name: "inherit", version: "2.1.0" },
];

/**
 * Sample config subset feeding the environment fingerprint.
 */
const CONFIG_SUBSET = { paths: { input: "/mod/src", output: "/mod/json" } };

/**
 * Builds a file-stats map from path and metadata pairs.
 *
 * @param entries Path and metadata pairs to seed the map.
 *
 * @returns The stats map keyed by path.
 */
function makeStats(
	entries: Array<[string, FileMetadata]>,
): Map<CanonicalPath, FileMetadata> {
	return new Map(entries);
}

describe("aggregateFingerprint", () => {
	test("is independent of entry order", () => {
		const forward = makeStats([
			["/a.json", { mtime: 1, size: 1 }],
			["/b.json", { mtime: 2, size: 2 }],
		]);
		const reverse = makeStats([
			["/b.json", { mtime: 2, size: 2 }],
			["/a.json", { mtime: 1, size: 1 }],
		]);

		expect(aggregateFingerprint(forward)).toBe(
			aggregateFingerprint(reverse),
		);
	});

	test("changes when a file's metadata changes", () => {
		const before = makeStats([["/a.json", { mtime: 1, size: 1 }]]);
		const after = makeStats([["/a.json", { mtime: 9, size: 1 }]]);

		expect(aggregateFingerprint(before)).not.toBe(
			aggregateFingerprint(after),
		);
	});

	test("changes when a file is added", () => {
		const before = makeStats([["/a.json", { mtime: 1, size: 1 }]]);

		const after = makeStats([
			["/a.json", { mtime: 1, size: 1 }],
			["/b.json", { mtime: 2, size: 2 }],
		]);

		expect(aggregateFingerprint(before)).not.toBe(
			aggregateFingerprint(after),
		);
	});
});

describe("environmentFingerprint", () => {
	test("is independent of transformer order", () => {
		const reversed = [...TRANSFORMERS].reverse();

		expect(environmentFingerprint(TRANSFORMERS, CONFIG_SUBSET)).toBe(
			environmentFingerprint(reversed, CONFIG_SUBSET),
		);
	});

	test("changes when a transformer version changes", () => {
		const bumped = [{ name: "math", version: "1.0.1" }, TRANSFORMERS[1]!];

		expect(environmentFingerprint(TRANSFORMERS, CONFIG_SUBSET)).not.toBe(
			environmentFingerprint(bumped, CONFIG_SUBSET),
		);
	});

	test("changes when config changes", () => {
		const moved = { paths: { input: "/mod/source", output: "/mod/json" } };

		expect(environmentFingerprint(TRANSFORMERS, CONFIG_SUBSET)).not.toBe(
			environmentFingerprint(TRANSFORMERS, moved),
		);
	});
});

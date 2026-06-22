/**
 * @file Tests for manifest persistence: round-trip, absence, and version gating.
 */

import { describe, expect, test } from "bun:test";
import { Cache } from "@frmds/frontier";
import { readManifest, writeManifest } from "../store.ts";
import { MANIFEST_VERSION, type BuildManifest } from "../types.ts";

/**
 * Builds a representative manifest for round-trip tests.
 *
 * @returns The assembled manifest.
 */
function makeManifest(): BuildManifest {
	return {
		version: MANIFEST_VERSION,
		environment: `{"apiVersion":"1.0.0"}`,
		dependencies: { dda: "abc123" },
		sources: {
			"/mod/src/items.json5": {
				source: { mtime: 1, size: 10 },
				reads: [],
				readsGlobally: false,
				output: {
					path: "/mod/json/items.json",
					metadata: { mtime: 2, size: 20 },
				},
			},
		},
	} as BuildManifest;
}

describe("manifest store", () => {
	test("round-trips a manifest", () => {
		const cache = new Cache({ persistent: false });
		const manifest = makeManifest();

		writeManifest(cache, manifest);

		expect(readManifest(cache)).toEqual(manifest);
	});

	test("returns undefined when absent", () => {
		const cache = new Cache({ persistent: false });

		expect(readManifest(cache)).toBeUndefined();
	});

	test("discards a version-mismatched manifest", () => {
		const cache = new Cache({ persistent: false });
		const stale = { ...makeManifest(), version: MANIFEST_VERSION - 1 };

		writeManifest(cache, stale);

		expect(readManifest(cache)).toBeUndefined();
	});
});

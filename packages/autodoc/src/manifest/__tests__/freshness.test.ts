/**
 * @file Tests the pure freshness decision: every mismatch class reports stale with a reason, a full match reports up to date.
 */

import { describe, expect, test } from "bun:test";
import type { CanonicalPath, FileMetadata } from "@frmds/frontier";
import { checkFreshness, type FreshnessInputs } from "../freshness.ts";
import { MANIFEST_VERSION, type BuildManifest } from "../types.ts";

/**
 * Path of the sample source file.
 */
const SOURCE = "/mod/src/items.json5";

/**
 * Path of the sample output file.
 */
const OUTPUT = "/mod/json/items.json";

/**
 * Builds freshness inputs describing a fully up-to-date build.
 *
 * @returns The assembled {@link FreshnessInputs}.
 */
function makeInputs(): FreshnessInputs {
	const manifest: BuildManifest = {
		version: MANIFEST_VERSION,
		environment: "env-a",
		dependencies: { ["dda"]: "dep-a" },
		sources: {
			[SOURCE]: {
				source: { mtime: 1, size: 10 },
				reads: [],
				readsGlobally: false,
				output: { path: OUTPUT, metadata: { mtime: 2, size: 20 } },
			},
		},
	};

	return {
		manifest,
		environment: "env-a",
		sources: new Map([[SOURCE, { mtime: 1, size: 10 }]]),
		dependencies: new Map([["dda", "dep-a"]]),
		outputs: new Map<CanonicalPath, FileMetadata>([
			[OUTPUT, { mtime: 2, size: 20 }],
		]),
	};
}

describe("checkFreshness", () => {
	test("up to date when everything matches", () => {
		expect(checkFreshness(makeInputs())).toEqual({
			upToDate: true,
			reason: "everything matches",
		});
	});

	test("stale without a manifest", () => {
		const inputs = { ...makeInputs(), manifest: undefined };

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});

	test("stale on environment mismatch", () => {
		const inputs = { ...makeInputs(), environment: "env-b" };

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});

	test("stale when a source changed", () => {
		const inputs = makeInputs();

		inputs.sources.set(SOURCE, { mtime: 9, size: 10 });

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});

	test("stale when a source was added", () => {
		const inputs = makeInputs();

		inputs.sources.set("/mod/src/new.json5", {
			mtime: 1,
			size: 1,
		});

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});

	test("stale when a source was removed", () => {
		const inputs = makeInputs();

		inputs.sources.clear();

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});

	test("stale when a dependency mod changed", () => {
		const inputs = makeInputs();

		inputs.dependencies.set("dda", "dep-b");

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});

	test("stale when an output is missing", () => {
		const inputs = makeInputs();

		inputs.outputs.clear();

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});

	test("stale when an output was tampered with", () => {
		const inputs = makeInputs();

		inputs.outputs.set(OUTPUT, { mtime: 99, size: 20 });

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});

	test("up to date when a source has no output (all objects excluded)", () => {
		const inputs = makeInputs();

		inputs.manifest!.sources[SOURCE]!.output = null;

		inputs.outputs.clear();

		expect(checkFreshness(inputs).upToDate).toBe(true);
	});

	test("stale when a recorded output is missing", () => {
		const inputs = makeInputs();

		inputs.outputs.clear();

		expect(checkFreshness(inputs).upToDate).toBe(false);
	});
});

/**
 * @file Tests for the dirty closure: seeds, bidirectional propagation, ownership changes, global readers, and removals.
 */

import { describe, expect, test } from "bun:test";
import type { CanonicalPath, FileMetadata } from "@frmds/frontier";
import { computeDirtySources, type DirtyInputs } from "../dirty.ts";
import {
	MANIFEST_VERSION,
	type BuildManifest,
	type SourceEntry,
} from "../types.ts";

/**
 * Path of the first sample source file.
 */
const FILE_A = "/mod/src/a.json5" as CanonicalPath;

/**
 * Path of the second sample source file.
 */
const FILE_B = "/mod/src/b.json5" as CanonicalPath;

/**
 * Path of the third sample source file.
 */
const FILE_C = "/mod/src/c.json5" as CanonicalPath;

/**
 * Baseline file metadata treated as unchanged.
 */
const META: FileMetadata = { mtime: 1, size: 1 };

/**
 * File metadata with a bumped mtime, treated as changed.
 */
const CHANGED: FileMetadata = { mtime: 2, size: 1 };

/**
 * Builds a source entry with sensible defaults.
 *
 * @param overrides - Fields to override on the default entry.
 * @returns The assembled source entry.
 */
function entry(overrides: Partial<SourceEntry> = {}): SourceEntry {
	return {
		source: META,
		reads: [],
		readsGlobally: false,
		output: { path: "/mod/json/x.json" as CanonicalPath, metadata: META },
		...overrides,
	};
}

/**
 * Builds the dirty-closure inputs for the baseline scenario.
 *
 * @param overrides - Fields to override on the default inputs.
 * @returns The assembled inputs.
 */
function makeInputs(overrides: Partial<DirtyInputs> = {}): DirtyInputs {
	// baseline: FILE_A reads FILE_B's armor; FILE_B and FILE_C read nothing
	const manifest: BuildManifest = {
		version: MANIFEST_VERSION,
		environment: "env",
		dependencies: {},
		sources: {
			[FILE_A]: entry({
				reads: [{ query: "ARMOR:plate", owners: [FILE_B] }],
			}),
			[FILE_B]: entry(),
			[FILE_C]: entry(),
		},
	};

	return {
		manifest,
		currentSources: new Map([
			[FILE_A, META],
			[FILE_B, META],
			[FILE_C, META],
		]),
		outputStats: new Map([["/mod/json/x.json" as CanonicalPath, META]]),
		resolveOwners: (query) => (query === "ARMOR:plate" ? [FILE_B] : []),
		scanReads: () => [],
		...overrides,
	};
}

describe("computeDirtySources", () => {
	test("nothing dirty when nothing changed", () => {
		const result = computeDirtySources(makeInputs());

		expect(result.dirty.size).toBe(0);
		expect(result.removed.size).toBe(0);
	});

	test("changed file is dirty; its readers follow (reverse)", () => {
		const inputs = makeInputs();

		inputs.currentSources.set(FILE_B, CHANGED);

		const result = computeDirtySources(inputs);

		expect(result.dirty).toEqual(new Set([FILE_B, FILE_A]));
	});

	test("changed reader pulls in its scan targets (forward)", () => {
		const inputs = makeInputs({
			scanReads: (file) => (file === FILE_A ? ["ARMOR:plate"] : []),
		});

		inputs.currentSources.set(FILE_A, CHANGED);

		const result = computeDirtySources(inputs);

		expect(result.dirty).toEqual(new Set([FILE_A, FILE_B]));
	});

	test("closure-dirty file's recorded reads propagate forward", () => {
		// FILE_C changes; FILE_A reads FILE_C (recorded); FILE_A also reads FILE_B → FILE_B re-executes for FILE_A
		const inputs = makeInputs();

		inputs.manifest.sources[FILE_A]!.reads.push({
			query: "recipe:kit",
			owners: [FILE_C],
		});

		inputs.resolveOwners = (query): CanonicalPath[] =>
			query === "ARMOR:plate"
				? [FILE_B]
				: query === "recipe:kit"
					? [FILE_C]
					: [];

		inputs.currentSources.set(FILE_C, CHANGED);

		const result = computeDirtySources(inputs);

		expect(result.dirty).toEqual(new Set([FILE_C, FILE_A, FILE_B]));
	});

	test("ownership change dirties the reader", () => {
		// plate moved from FILE_B to FILE_C; neither file's stats changed from the manifest's view of FILE_A's read
		const inputs = makeInputs({
			resolveOwners: (query) => (query === "ARMOR:plate" ? [FILE_C] : []),
		});

		inputs.currentSources.set(FILE_B, CHANGED);
		inputs.currentSources.set(FILE_C, CHANGED);

		const result = computeDirtySources(inputs);

		expect(result.dirty.has(FILE_A)).toBe(true);
	});

	test("new file is a seed", () => {
		const FILE_D = "/mod/src/d.json5" as CanonicalPath;
		const inputs = makeInputs();

		inputs.currentSources.set(FILE_D, META);

		expect(computeDirtySources(inputs).dirty.has(FILE_D)).toBe(true);
	});

	test("removed file lands in removed, and its readers dirty via ownership change", () => {
		const inputs = makeInputs({ resolveOwners: () => [] });

		inputs.currentSources.delete(FILE_B);

		const result = computeDirtySources(inputs);

		expect(result.removed).toEqual(new Set([FILE_B]));
		expect(result.dirty.has(FILE_A)).toBe(true);
	});

	test("missing output is a seed", () => {
		const inputs = makeInputs({ outputStats: new Map() });

		expect(computeDirtySources(inputs).dirty).toEqual(
			new Set([FILE_A, FILE_B, FILE_C]),
		);
	});

	test("global reader is dirty whenever anything is dirty", () => {
		const inputs = makeInputs();

		inputs.manifest.sources[FILE_C]!.readsGlobally = true;

		inputs.currentSources.set(FILE_B, CHANGED);

		expect(computeDirtySources(inputs).dirty.has(FILE_C)).toBe(true);
	});
});

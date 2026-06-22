/**
 * @file Tests for the per-mod transformer loader: array export names, array-valued exports, and name-based dedup.
 */

import { describe, expect, test } from "bun:test";
import type { Transformer } from "../../types/types.ts";
import {
	dedupeTransformers,
	loadTransformers,
	validateTransformerRef,
} from "../@loader.ts";

/**
 * Mod root for testing purposes.
 */
const MOD_ROOT = import.meta.dir;

/**
 * Transformer-like fixture to test on.
 */
const FIXTURE = "__fixtures__/transformer-exports.ts";

/**
 * Lists the names of the loaded transformers.
 */
function getLoadedTransformers(transformers: Transformer[]): string[] {
	return transformers.map((transformer) => transformer.name);
}

describe("loadTransformers", () => {
	test("loads a single named export", async () => {
		const loaded = await loadTransformers(
			{ module: FIXTURE, export: "SINGLE" },
			MOD_ROOT,
		);

		expect(getLoadedTransformers(loaded)).toEqual(["single"]);
	});

	test("loads the default export when no export is declared", async () => {
		const loaded = await loadTransformers({ module: FIXTURE }, MOD_ROOT);

		expect(getLoadedTransformers(loaded)).toEqual(["default-export"]);
	});

	test("loads multiple named exports from one declaration", async () => {
		const loaded = await loadTransformers(
			{ module: FIXTURE, export: ["SINGLE", "default"] },
			MOD_ROOT,
		);

		expect(getLoadedTransformers(loaded)).toEqual([
			"single",
			"default-export",
		]);
	});

	test("flattens an array-valued export", async () => {
		const loaded = await loadTransformers(
			{ module: FIXTURE, export: "PAIR" },
			MOD_ROOT,
		);

		expect(getLoadedTransformers(loaded)).toEqual(["pair-a", "pair-b"]);
	});

	test("mixes array-valued and single-valued exports", async () => {
		const loaded = await loadTransformers(
			{ module: FIXTURE, export: ["PAIR", "SINGLE"] },
			MOD_ROOT,
		);

		expect(getLoadedTransformers(loaded)).toEqual([
			"pair-a",
			"pair-b",
			"single",
		]);
	});

	test("rejects an empty array-valued export", async () => {
		expect(
			loadTransformers({ module: FIXTURE, export: "EMPTY" }, MOD_ROOT),
		).rejects.toThrow(/"EMPTY".*no transformers/);
	});

	test("names the failing index when an array element is invalid", async () => {
		expect(
			loadTransformers(
				{ module: FIXTURE, export: "BAD_ARRAY" },
				MOD_ROOT,
			),
		).rejects.toThrow(/BAD_ARRAY\[1\]/);
	});
});

describe("validateTransformerRef", () => {
	test("accepts an array of export names", () => {
		expect(() =>
			validateTransformerRef({ module: FIXTURE, export: ["A", "B"] }),
		).not.toThrow();
	});

	test("rejects an empty export array", () => {
		expect(() =>
			validateTransformerRef({ module: FIXTURE, export: [] }),
		).toThrow(/Invalid transformer reference/);
	});
});

describe("dedupeTransformers", () => {
	test("keeps the first occurrence of each name", () => {
		const first = { name: "duplicate" } as Transformer;
		const second = { name: "duplicate" } as Transformer;
		const other = { name: "other" } as Transformer;

		const deduped = dedupeTransformers([first, other, second]);

		expect(deduped).toEqual([first, other]);
		expect(deduped[0]).toBe(first);
	});
});

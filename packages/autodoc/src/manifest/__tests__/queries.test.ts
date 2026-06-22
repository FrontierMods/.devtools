/**
 * @file Tests for read queries: format round-trips, key conversion, and owner resolution over file contexts.
 */

import { describe, expect, test } from "bun:test";
import type { CanonicalPath, CompoundKey } from "@frmds/frontier";
import type { FileContext } from "../../types/types.ts";
import { buildQueryResolver, makeQuery, queryFromKey } from "../queries.ts";

/**
 * Path of the first sample source file.
 */
const FILE_A = "/mod/src/a.json5" as CanonicalPath;

/**
 * Path of the second sample source file.
 */
const FILE_B = "/mod/src/b.json5" as CanonicalPath;

/**
 * Sample file contexts used to resolve owners.
 */
const CONTEXTS = [
	{
		sourcePath: FILE_A,
		modId: "armory",
		objects: [{ id: "vest", type: "ARMOR" }],
	},
	{
		sourcePath: FILE_B,
		modId: "armory",
		objects: [
			{ id: "vest", type: "recipe" },
			{ id: "plate", type: "ARMOR" },
		],
	},
] as unknown as FileContext[];

describe("makeQuery / queryFromKey", () => {
	test("typed and untyped forms", () => {
		expect(makeQuery("vest", "ARMOR")).toBe("ARMOR:vest");
		expect(makeQuery("vest")).toBe("*:vest");
	});

	test("converts compound keys, preserving wildcards", () => {
		expect(queryFromKey("armory:ARMOR:vest" as CompoundKey)).toBe(
			"ARMOR:vest",
		);
		expect(queryFromKey("armory:*:vest" as CompoundKey)).toBe("*:vest");
	});
});

describe("buildQueryResolver", () => {
	const resolve = buildQueryResolver(CONTEXTS);

	test("typed query resolves to its owner", () => {
		expect(resolve("ARMOR:vest")).toEqual([FILE_A]);
	});

	test("untyped query resolves to all owners of the ID, sorted", () => {
		expect(resolve("*:vest")).toEqual([FILE_A, FILE_B]);
	});

	test("unknown query resolves to no owners", () => {
		expect(resolve("ARMOR:unobtainium")).toEqual([]);
	});
});

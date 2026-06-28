/**
 * @file Tests for sugar-to-JSON-Patch conversion, focused on filter-based `replace`.
 */

import { describe, expect, test } from "bun:test";
import { convertToJSONPatch } from "../convert.ts";

describe("convertToJSONPatch replace", () => {
	const target = {
		items: [
			{ id: "a", quantity: 1 },
			{ id: "b", quantity: 2 },
			{ id: "a", quantity: 3 },
		],
	};

	test("replaces a single value when no filter is given", () => {
		const operations = convertToJSONPatch(
			{ op: "replace", path: ["items", "0", "quantity"], value: 9 },
			target,
		);

		expect(operations).toEqual([
			{ op: "replace", path: "/items/0/quantity", value: 9 },
		]);
	});

	test("replaces every array item matching the filter", () => {
		const operations = convertToJSONPatch(
			{
				op: "replace",
				path: ["items"],
				value: { id: "x" },
				filter: [{ id: "a" }],
			},
			target,
		);

		expect(operations).toEqual([
			{ op: "replace", path: "/items/0", value: { id: "x" } },
			{ op: "replace", path: "/items/2", value: { id: "x" } },
		]);
	});

	test("yields no operations when the filter matches nothing", () => {
		const operations = convertToJSONPatch(
			{
				op: "replace",
				path: ["items"],
				value: { id: "x" },
				filter: [{ id: "missing" }],
			},
			target,
		);

		expect(operations).toEqual([]);
	});

	test("ignores an empty filter and replaces the path itself", () => {
		const operations = convertToJSONPatch(
			{ op: "replace", path: ["items"], value: [], filter: [] },
			target,
		);

		expect(operations).toEqual([
			{ op: "replace", path: "/items", value: [] },
		]);
	});

	test("throws when filtering a non-array value", () => {
		expect(() =>
			convertToJSONPatch(
				{
					op: "replace",
					path: ["items", "0"],
					value: { id: "x" },
					filter: [{ id: "a" }],
				},
				target,
			),
		).toThrow(/non-array/);
	});
});

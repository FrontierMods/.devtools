/**
 * @file Tests for relative patch path resolution, including `from` paths on move/copy.
 */

import { describe, expect, test } from "bun:test";
import { resolvePatchPath } from "../paths.ts";

describe("resolvePatchPath", () => {
	test("resolves path against the base", () => {
		const resolved = resolvePatchPath(
			{ op: "replace", path: ["..", "volume"], value: "1 L" },
			["0", "pocket_data"],
		);

		expect(resolved.path).toEqual(["0", "volume"]);
	});

	test("resolves from on move like path", () => {
		const resolved = resolvePatchPath(
			{ op: "move", path: ["name"], from: ["..", "old_name"] },
			["0"],
		);

		expect(resolved.path).toEqual(["0", "name"]);
		expect((resolved as { from: unknown }).from).toEqual(["old_name"]);
	});

	test("throws above the base root", () => {
		expect(() =>
			resolvePatchPath({ op: "remove", path: ["..", ".."] }, ["0"]),
		).toThrow(/above root/);
	});
});

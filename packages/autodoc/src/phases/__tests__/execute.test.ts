/**
 * @file Tests for work-queue maintenance.
 */

import { describe, expect, test } from "bun:test";
import type { Patch, PropertyPath } from "@frmds/frontier";
import { createExecutionTarget, getPathKey } from "../../path-cache.ts";
import { Type } from "typebox";
import type { ExecutionTarget, Transformer } from "../../types/types.ts";
import { collectModifiedPaths, filterWorkQueue } from "../path-mutations.ts";

/**
 * Inert transformer used to populate execution targets.
 */
const STUB_TRANSFORMER: Transformer = {
	name: "stub",
	version: "1.0.0",
	description: "Test stub",
	api: "1.0.0",
	target: { content: Type.Never() },
	transform: () => [],
};

/**
 * Builds an execution target at the given path.
 *
 * @param path - Property path the target addresses.
 * @returns The execution target.
 */
function makeTarget(path: PropertyPath): ExecutionTarget {
	return createExecutionTarget(path, STUB_TRANSFORMER, path.length);
}

describe("filterWorkQueue", () => {
	test("drops targets at a removed path", () => {
		const remaining = [makeTarget(["pocket_data", "0"])];
		const patches: Patch[] = [{ op: "remove", path: ["pocket_data", "0"] }];

		expect(filterWorkQueue(remaining, patches)).toEqual([]);
	});

	test("shifts later array indices left after a remove", () => {
		const remaining = [makeTarget(["pocket_data", "2"])];
		const patches: Patch[] = [{ op: "remove", path: ["pocket_data", "0"] }];

		const [adjusted] = filterWorkQueue(remaining, patches);

		expect(adjusted?.path).toEqual(["pocket_data", "1"]);
	});

	test("shifts later array indices right after an insert", () => {
		const remaining = [makeTarget(["pocket_data", "1"])];

		const patches: Patch[] = [
			{ op: "insert", path: ["pocket_data", "0"], value: {} },
		];

		const [adjusted] = filterWorkQueue(remaining, patches);

		expect(adjusted?.path).toEqual(["pocket_data", "2"]);
	});

	test("nets remove + N inserts at the same index (pocket multiplication)", () => {
		// multiplyPockets with multi: 2 at index 0 → sibling target at 1 must land at 2
		const remaining = [makeTarget(["pocket_data", "1"])];

		const patches: Patch[] = [
			{ op: "remove", path: ["pocket_data", "0"] },
			{ op: "insert", path: ["pocket_data", "0"], value: {} },
			{ op: "insert", path: ["pocket_data", "0"], value: {} },
		];

		const [adjusted] = filterWorkQueue(remaining, patches);

		expect(adjusted?.path).toEqual(["pocket_data", "2"]);
	});

	test("adjusts paths nested below a shifted array element", () => {
		const remaining = [
			makeTarget(["pocket_data", "2", "max_contains_weight"]),
		];

		const patches: Patch[] = [{ op: "remove", path: ["pocket_data", "0"] }];

		const [adjusted] = filterWorkQueue(remaining, patches);

		expect(adjusted?.path).toEqual([
			"pocket_data",
			"1",
			"max_contains_weight",
		]);
	});

	test("re-keys adjusted targets so dedup sees the new path", () => {
		const remaining = [makeTarget(["pocket_data", "1"])];

		const patches: Patch[] = [
			{ op: "insert", path: ["pocket_data", "0"], value: {} },
		];

		const [adjusted] = filterWorkQueue(remaining, patches);

		expect(getPathKey(adjusted!)).toBe(
			JSON.stringify(["pocket_data", "2"]),
		);
	});

	test("treats object-property inserts as modifications", () => {
		const remaining = [makeTarget(["weight"])];
		const patches: Patch[] = [{ op: "insert", path: ["weight"], value: 1 }];

		expect(filterWorkQueue(remaining, patches)).toEqual([]);
	});

	test("array inserts do not invalidate unrelated sibling targets", () => {
		const remaining = [makeTarget(["pocket_data", "0"])];

		const patches: Patch[] = [
			{ op: "insert", path: ["pocket_data", "2"], value: {} },
		];

		const [kept] = filterWorkQueue(remaining, patches);

		expect(kept?.path).toEqual(["pocket_data", "0"]);
	});
});

describe("collectModifiedPaths", () => {
	test("tracks every index written by remove + N inserts at the same position", () => {
		const patches: Patch[] = [
			{ op: "remove", path: ["pocket_data", "0"] },
			{ op: "insert", path: ["pocket_data", "0"], value: {} },
			{ op: "insert", path: ["pocket_data", "0"], value: {} },
		];

		const modified = collectModifiedPaths(patches);

		expect(modified).toEqual(
			new Set([
				JSON.stringify(["pocket_data", "0"]),
				JSON.stringify(["pocket_data", "1"]),
			]),
		);
	});

	test("tracks replaced array elements", () => {
		const patches: Patch[] = [
			{ op: "replace", path: ["pocket_data", "5"], value: {} },
		];

		const modified = collectModifiedPaths(patches);

		expect(modified).toEqual(
			new Set([JSON.stringify(["pocket_data", "5"])]),
		);
	});

	test("tracks object property writes", () => {
		const patches: Patch[] = [{ op: "insert", path: ["weight"], value: 1 }];

		const modified = collectModifiedPaths(patches);

		expect(modified).toEqual(new Set([JSON.stringify(["weight"])]));
	});
});

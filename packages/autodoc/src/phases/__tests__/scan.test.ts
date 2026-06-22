/**
 * @file Tests positional re-collection.
 */

import { describe, expect, test } from "bun:test";
import { Type } from "typebox";
import type { GameObject, Transformer } from "../../types/types.ts";
import { scanValueSubtree } from "../scan.ts";

/**
 * Positional transformer targeting a `dimensions` container.
 */
const DIMENSIONS_POSITIONAL: Transformer = {
	name: "calculateDimensions",
	version: "3.0.0",
	api: "1.0.0",
	target: {
		paths: [["dimensions"]],
		content: Type.Object(
			{ type: Type.Literal("rectangle") },
			{ additionalProperties: true },
		),
	},
	transform: () => [],
};

/**
 * Sample object carrying a positional `dimensions` subtree.
 */
const OBJECT = {
	id: "crate",
	type: "ITEM",
	dimensions: {
		type: "rectangle",
		width: "1 cm",
		height: "1 cm",
		length: "1 cm",
	},
} as unknown as GameObject;

/**
 * Scan context anchored to {@link OBJECT}.
 */
const CONTEXT = {
	currentObject: OBJECT,
	modId: "test_mod",
	sourcePath: "/mod/src/items.json5",
};

/**
 * Collects the names of transformers scheduled against the `["dimensions"]` path for a rescan rooted at `basePath`.
 */
function scheduledAtDimensions(basePath: string[]): string[] {
	const value = basePath.reduce<unknown>(
		(node, segment) => (node as Record<string, unknown>)?.[segment],
		OBJECT,
	);

	return scanValueSubtree(
		value as never,
		basePath,
		[DIMENSIONS_POSITIONAL],
		CONTEXT,
	)
		.filter((target) => target.path.join(".") === "dimensions")
		.map((target) => target.transformer.name);
}

describe("scanValueSubtree positional re-collection", () => {
	test("re-collects the container pattern when a descendant is the modified path", () => {
		// the regression: `dimensions.width` resolved late → `["dimensions"]` must be re-scheduled
		expect(scheduledAtDimensions(["dimensions", "width"])).toEqual([
			"calculateDimensions",
		]);
	});

	test("re-collects the container pattern when it is itself the modified path", () => {
		expect(scheduledAtDimensions(["dimensions"])).toEqual([
			"calculateDimensions",
		]);
	});

	test("does not schedule the container for an unrelated modified path", () => {
		expect(scheduledAtDimensions(["weight"])).toEqual([]);
	});
});

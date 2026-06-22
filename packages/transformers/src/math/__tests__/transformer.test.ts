/** @file math transform tests: both syntax forms, quantity-aware ops, and deferral when the base is not yet operable. */

import { describe, expect, test } from "bun:test";
import { TransformerSkip } from "@frmds/autodoc";
import type { TransformContext } from "@frmds/autodoc";
import MATH_TRANSFORMER from "../transformer.ts";

/** Minimal transform context shared by every case. */
const CONTEXT = {
	modId: "test_mod",
	sourcePath: "/mod/src/items.json5",
} as TransformContext;

/** The single value a successful run writes in place of the expression. */
function result(expression: Record<string, unknown>): unknown {
	const [patch] = MATH_TRANSFORMER.transform(expression as never, CONTEXT);

	return patch?.op === "replace" ? patch.value : undefined;
}

describe("resolveMath", () => {
	test("array shorthand applies operations left-to-right", () => {
		// (100 * 2) + 50 = 250
		expect(
			result({
				math: [
					100,
					{ op: "multiply", value: 2 },
					{ op: "add", value: 50 },
				],
			}),
		).toBe(250);
	});

	test("object form resolves quantity strings with unit conversion", () => {
		// 50 g * 2 → 100 g → 0.1 kg
		expect(
			result({
				math: "50 g",
				ops: [
					{ op: "multiply", value: 2 },
					{ op: "convert", value: "kg" },
				],
			}),
		).toBe("0.1 kg");
	});

	test("returns the base unchanged when there are no operations", () => {
		expect(result({ math: [42] })).toBe(42);
	});

	test("defers (TransformerSkip) when the base is not yet operable", () => {
		expect(() =>
			MATH_TRANSFORMER.transform(
				{ math: [{ ref: "$", path: ["weight"] }] } as never,
				CONTEXT,
			),
		).toThrow(TransformerSkip);
	});
});

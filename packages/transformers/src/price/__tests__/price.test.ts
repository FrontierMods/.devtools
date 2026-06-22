/** @file price transform tests: Modified-Fibonacci scaling, label/number equivalence, in-place replacement, and failure context. */

import { describe, expect, test } from "bun:test";
import type { TransformContext } from "@frmds/autodoc";
import type { Patch } from "@frmds/frontier";
import PRICE_TRANSFORMER from "../transformer.ts";
import type { RawBarterPriceIndex } from "../types.ts";

/** The transformer only reads `currentObject` on its failure path; the cast documents that contract rather than fabricating the full pipeline state. */
const CONTEXT = {
	currentObject: { type: "ITEM", id: "test_item" },
} as TransformContext;

/** Run the transformer over an index and return its patches. */
function transform(index: RawBarterPriceIndex): Patch[] {
	return PRICE_TRANSFORMER.transform(index, CONTEXT);
}

/** The value a successful run writes in place of the index. */
function price(index: RawBarterPriceIndex): string | null {
	const [patch] = transform(index);

	return patch?.op === "replace" ? (patch.value as string) : null;
}

describe("calculatePrice", () => {
	test("replaces the index in place with a canonical price string", () => {
		expect(transform({ utility: 3, longevity: 3, scarcity: 3 })).toEqual([
			{ op: "replace", path: [], value: "51 USD" },
		]);
	});

	test("scales price with the summed score (Modified Fibonacci)", () => {
		expect(price({ utility: 0, longevity: 0, scarcity: 0 })).toBe(
			"0 cents",
		);
		expect(price({ utility: 1, longevity: 0, scarcity: 0 })).toBe("1 USD");
		expect(price({ utility: 2, longevity: 2, scarcity: 2 })).toBe("12 USD");
		expect(price({ utility: 3, longevity: 3, scarcity: 3 })).toBe("51 USD");
	});

	test("treats qualitative labels as their numeric scores", () => {
		expect(
			price({ utility: "high", longevity: "medium", scarcity: "low" }),
		).toBe(price({ utility: 3, longevity: 2, scarcity: 1 }));
	});

	test("fails with the object id when a score is out of range", () => {
		expect(() =>
			transform({ utility: 5, longevity: 0, scarcity: 0 }),
		).toThrow(/failed to calculate price for `test_item`/);
	});

	test("fails when a label is not recognized", () => {
		expect(() =>
			transform({
				utility: "huge",
				longevity: 0,
				scarcity: 0,
			} as RawBarterPriceIndex),
		).toThrow(/failed to calculate price/);
	});
});

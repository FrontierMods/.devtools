/** @file Declared-kind threading tests: ambiguous suffixes resolve by the field's kind, not the parser's guess. */

import { describe, expect, test } from "bun:test";
import type { TransformContext } from "@frmds/autodoc";
import type { PropertyPath } from "@frmds/frontier";
import CANONICAL_TRANSFORMER from "../transformer.ts";

/** The transformer only reads `propertyPath` from its context; the cast documents that contract rather than fabricating the full pipeline state. */
function contextAt(propertyPath: PropertyPath): TransformContext {
	return { propertyPath } as TransformContext;
}

/** The canonical value produced for a field, or `null` when nothing is rewritten. */
function transformed(value: string, propertyPath: PropertyPath): string | null {
	const patches = CANONICAL_TRANSFORMER.transform(
		value,
		contextAt(propertyPath),
	);

	if (!patches.length) return null;

	return patches[0]?.op === "replace" ? (patches[0].value as string) : null;
}

describe("canonicalizeQuantity with declared kinds", () => {
	test("ambiguous `m` at a time field reads as minutes, not metres", () => {
		expect(transformed("5.5 m", ["spoils_in"])).toBe("5 minute 30 second");
	});

	test("`turns` at a time field reads as game turns (1 turn = 1 s)", () => {
		expect(transformed("30 turns", ["spoils_in"])).toBe("30 second");
	});

	test("`t` resolves by kind: turns at a time field, tonnes at a mass field", () => {
		expect(transformed("5 t", ["countdown_interval"])).toBe("5 second");
		expect(transformed("5 t", ["weight"])).toBe("5000 kg");
	});

	test("a foreign unit converts within its declared kind", () => {
		expect(transformed("7.5 in", ["longest_side"])).toBe("19 cm 1 mm");
	});

	test("an already-canonical compound is left untouched", () => {
		expect(transformed("1 kg 200 g", ["weight"])).toBeNull();
	});

	test("wildcard positions resolve their kind", () => {
		expect(
			transformed("0.5 L", ["pocket_data", "0", "max_contains_volume"]),
		).toBe("500 ml");
	});
});

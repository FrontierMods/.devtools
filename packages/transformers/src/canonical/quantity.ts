/**
 * @file canonical's carried quantity infra: the glue over the third-party `@quantities` libs, plus kind-aware parsing for game suffixes the library mis-resolves.
 */

import type { SupportedKind } from "@frmds/autodoc";
import { Quantity } from "../quantity.ts";

/** One `<number><suffix>` term of a quantity string; authoring-side values may carry decimals even though the game grammar is integer-only. */
const TERM = /([+-]?\d+(?:\.\d+)?)\s*([a-zA-Z°$]+)/g;

/**
 * Game suffixes the library mis-resolves, mapped per kind to the library's canonical unit name. Only `time` collides: `m` parses as metres and `t` as tonnes; `turn`/`turns` are unknown to the library. 1 game turn = 1 second exactly, so turns map to seconds instead of registering a custom unit.
 */
const GAME_UNIT_OVERRIDES: Partial<
	Record<SupportedKind, Record<string, string>>
> = {
	// oxlint-disable-next-line id-length
	time: { m: "minute", t: "second", turn: "second", turns: "second" },
};

/**
 * Parses a quantity string under the field's declared `kind`, so ambiguous game suffixes resolve by what the field means rather than by the library's first guess. Terms with overridden suffixes are constructed via the two-arg `Quantity(magnitude, name)` form and folded with `.add()`; everything else passes straight to the library's string parse.
 */
export function parseGameQuantity(
	value: string,
	kind: SupportedKind,
): Quantity {
	const overrides = GAME_UNIT_OVERRIDES[kind];

	if (!overrides) return Quantity(value);

	const terms = [...value.matchAll(TERM)];

	const hasOverriddenSuffix = terms.some(
		([, , suffix]) => suffix !== undefined && suffix in overrides,
	);

	if (!hasOverriddenSuffix) return Quantity(value);

	return terms
		.map(([, magnitude, suffix]) =>
			Quantity(Number(magnitude), overrides[suffix ?? ""] ?? suffix),
		)
		.reduce((total, term) => total.add(term));
}

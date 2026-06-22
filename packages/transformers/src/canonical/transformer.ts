/**
 * @file The `canonical` transformer: positional target over item quantity positions; normalizes any quantity string to canonical integer compound metric.
 */

import { CANONICAL_UNITS } from "@frmds/autodoc";
import type { Patch, PropertyPath } from "@frmds/frontier";
import { Type } from "typebox";
import { parseGameQuantity } from "./quantity.ts";
import type { SupportedKind, Transformer } from "@frmds/autodoc";

/** A hand-authored quantity position paired with the kind the game declares for that field (`*` = array wildcard). The kinds mirror the schema's `<kind>_quantity` assignments bridged to library kind names (`time_duration` → `time`, `money` → `currency`). */
interface QuantityPosition {
	path: PropertyPath;
	kind: SupportedKind;
}

/**
 * Schema for the transformer to match against.
 */
const ContentSchema = Type.String({
	pattern: /^\s*-?[\d.]+(?:e[+-]?\d+)?\s*[a-zA-Z]/,
});

/**
 * Paths for the transformer to check at.
 */
const POSITIONS = [
	{ path: ["weight"], kind: "mass" },
	{ path: ["volume"], kind: "volume" },
	{ path: ["longest_side"], kind: "length" },
	{ path: ["integral_weight"], kind: "mass" },
	{ path: ["integral_volume"], kind: "volume" },
	{ path: ["integral_longest_side"], kind: "length" },
	{ path: ["countdown_interval"], kind: "time" },
	{ path: ["spoils_in"], kind: "time" },
	{ path: ["barrel_volume"], kind: "volume" },
	{ path: ["barrel_length"], kind: "length" },
	{ path: ["brew_time"], kind: "time" },
	{ path: ["install_time"], kind: "time" },
	{ path: ["price"], kind: "currency" },
	{ path: ["price_postapoc"], kind: "currency" },
	{ path: ["time_to_learn"], kind: "time" },
	{ path: ["pocket_data", "*", "min_item_volume"], kind: "volume" },
	{ path: ["pocket_data", "*", "max_item_volume"], kind: "volume" },
	{ path: ["pocket_data", "*", "max_contains_volume"], kind: "volume" },
	{ path: ["pocket_data", "*", "max_contains_weight"], kind: "mass" },
	{ path: ["pocket_data", "*", "max_item_length"], kind: "length" },
	{ path: ["pocket_data", "*", "min_item_length"], kind: "length" },
	{ path: ["pocket_data", "*", "magazine_well"], kind: "volume" },
] satisfies QuantityPosition[];

/**
 * Transformer.
 */
const CANONICAL_TRANSFORMER: Transformer<string> = {
	name: "canonicalizeQuantity",
	version: "1.0.0",
	api: "1.0.0",
	description:
		"Normalizes quantity strings at item quantity positions to canonical integer compound metric.",
	target: {
		paths: POSITIONS.map((position) => position.path),
		content: ContentSchema,
	},

	transform(value, context): Patch[] {
		const kind = kindAt(context.propertyPath);
		const quantity = parseGameQuantity(value, kind);

		// * precision 0 automatically rounds values below the smallest unit (e.g. `96.36 mg` → `96 mg`)
		const converted = quantity.toCompound(CANONICAL_UNITS[kind], {
			precision: 0,
		});

		if (converted === value) return [];

		return [{ op: "replace", value: converted }];
	},
};

/**
 * Resolves the declared kind for a matched property path.
 */
function kindAt(propertyPath: PropertyPath): SupportedKind {
	const match = POSITIONS.find(
		({ path }) =>
			path.length === propertyPath.length &&
			path.every(
				(segment, index) =>
					segment === "*" || segment === String(propertyPath[index]),
			),
	);

	if (!match)
		throw new Error(
			`canonicalizeQuantity(): no declared kind for path \`${propertyPath.join(".")}\``,
		);

	return match.kind;
}

export default CANONICAL_TRANSFORMER;

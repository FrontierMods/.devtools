/**
 * @file Per-type `longest_side` calculators for `dimensions` objects, and the `isSoft` predicate that decides whether a longest side is definable at all.
 */

import { isObject, isNotNullLike } from "@frmds/frontier";
import { CANONICAL_UNITS } from "@frmds/autodoc";
import { Quantity } from "../quantity.ts";
import type {
	Dimensions,
	DimensionsArea,
	DimensionsCylinder,
	DimensionsRectangle,
} from "./schema.ts";

/**
 * Checks whether the object is a `dimensions` object.
 */
function isDimensionsObject(value: unknown): value is Dimensions {
	return isObject(value) && isNotNullLike(value);
}

/**
 * Checks if the dimensions object reflects a portion with no longest side to compute from.
 */
export function isSoft(dimensions: unknown): boolean {
	return (
		isDimensionsObject(dimensions) &&
		"soft" in dimensions &&
		typeof dimensions.soft === "boolean" &&
		dimensions.soft
	);
}

/** Longest side of a rectangle, or `""` when the object is soft (foldable). */
export function calculateRectangleLongestSide(
	dimensions: DimensionsRectangle,
): string {
	const { width, height, length } = dimensions;

	const qWidth = Quantity(width);
	const qHeight = Quantity(height);
	const qLength = Quantity(length);

	const canDefineLongestSide = !isSoft(dimensions);

	const longestSide = canDefineLongestSide
		? Quantity.max(qWidth, qHeight, qLength).toCompound(
				CANONICAL_UNITS.length,
				{
					precision: 0,
				},
			)
		: "";

	return longestSide;
}

/** Longest side of a cylinder, or `""` when the object is soft (foldable). */
export function calculateCylinderLongestSide(
	dimensions: DimensionsCylinder,
): string {
	const { diameter, length } = dimensions;

	const qDiameter = Quantity(diameter);
	const qLength = Quantity(length);

	const canDefineLongestSide = !isSoft(dimensions);

	const longestSide = canDefineLongestSide
		? Quantity.max(qDiameter, qLength).toCompound(CANONICAL_UNITS.length, {
				precision: 0,
			})
		: "";

	return longestSide;
}

/** Area dimensions carry no derivable longest side; always `""`. */
export function calculateAreaLongestSide(_dimensions: DimensionsArea): string {
	// * area-based dimensions must provide their own longest-side value
	return "";
}

/** Upperwear is foldable and has no fixed longest side; always `""`. */
export function calculateUpperwearLongestSide(): string {
	// * clothes are soft enough to be foldable, thus not having a fixed longest side
	return "";
}

/** Lowerwear is foldable and has no fixed longest side; always `""`. */
export function calculateLowerwearLongestSide(): string {
	// * clothes are soft enough to be foldable, thus not having a fixed longest side
	return "";
}

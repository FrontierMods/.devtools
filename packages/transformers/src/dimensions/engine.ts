/**
 * @file Dimensions engine: dispatches each `dimensions` to its `volume`/`longest_side` calculator and aggregates across arrays.
 */

import { isNotNullLike } from "@frmds/frontier";
import { CANONICAL_UNITS } from "@frmds/autodoc";
import { Quantity } from "../quantity.ts";
import {
	calculateAreaLongestSide,
	calculateCylinderLongestSide,
	calculateLowerwearLongestSide,
	calculateRectangleLongestSide,
	calculateUpperwearLongestSide,
	isSoft,
} from "./longest-side.ts";
import type { Dimensions, DimensionObject } from "./schema.ts";
import {
	calculateAreaVolume,
	calculateCylinderVolume,
	calculateLowerwearVolume,
	calculateRectangleVolume,
	calculateUpperwearVolume,
} from "./volume.ts";

/**
 * Function to calculate volume from dimensions.
 */
type VolumeCalculatorFn = (
	dimensions: Extract<DimensionObject, "type">,
) => Quantity;

/**
 * Function to calculate longest side from dimensions.
 */
type LongestSideCalculatorFn = (
	dimensions: Extract<DimensionObject, "type">,
) => string;

/**
 * Smallest volume the game can represent: `units::volume` counts whole milliliters.
 */
const MINIMUM_VOLUME = Quantity("1 ml");

/**
 * Calculators for `volume` and `longest_side` per type of `dimensions` object.
 */
const CALCULATORS = {
	rectangle: {
		volume: calculateRectangleVolume,
		longestSide: calculateRectangleLongestSide,
	},
	cylinder: {
		volume: calculateCylinderVolume,
		longestSide: calculateCylinderLongestSide,
	},
	area: {
		volume: calculateAreaVolume,
		longestSide: calculateAreaLongestSide,
	},
	upperwear: {
		volume: calculateUpperwearVolume,
		longestSide: calculateUpperwearLongestSide,
	},
	lowerwear: {
		volume: calculateLowerwearVolume,
		longestSide: calculateLowerwearLongestSide,
	},
} as const satisfies Record<
	string,
	| Record<"volume", VolumeCalculatorFn>
	| Record<"longestSide", LongestSideCalculatorFn>
>;

/**
 * Normalizes a quantity string to canonical compound metric, rounding to the nearest integer; returns the input unchanged when it is not a parseable quantity. Duplicated locally to keep the transformer independent.
 */
function normalizeQuantityString(value: string): string {
	try {
		return Quantity(value).toCompound();
	} catch {
		// * not a valid quantity
		return value;
	}
}

/**
 * Sum raw volumes from the `dimensions` object or array.
 */
function sumVolumes(dimensions: Dimensions): Quantity {
	if (Array.isArray(dimensions))
		return dimensions.reduce(
			(accumulator, dimension) => accumulator.add(sumVolumes(dimension)),
			Quantity("0 ml"),
		);

	// * this is necessary to narrow the type per called calculator
	switch (dimensions.type) {
		case "rectangle":
			return CALCULATORS.rectangle.volume(dimensions);
		case "cylinder":
			return CALCULATORS.cylinder.volume(dimensions);
		case "area":
			return CALCULATORS.area.volume(dimensions);
		case "upperwear":
			return CALCULATORS.upperwear.volume(dimensions);
		case "lowerwear":
			return CALCULATORS.lowerwear.volume(dimensions);
	}
}

/**
 * Calculate total volume from the `dimensions` object or array (volumes are summed), raised to {@link MINIMUM_VOLUME}.
 */
export function getVolumeFromDimensions(dimensions: Dimensions): Quantity {
	return Quantity.max(sumVolumes(dimensions), MINIMUM_VOLUME);
}

/**
 * Calculate the longest side from the `dimensions` object or array, or `null` when none is definable.
 */
export function getLongestSideFromDimensions(
	dimensions: Dimensions,
): string | null {
	if (Array.isArray(dimensions)) {
		// * either none of them is `soft`...
		const canDefineLongestSide = dimensions.every(
			(dimension) => !isSoft(dimension),
		);
		// * ...or all of them are
		const allDimensionsAreSoft = dimensions.every((dimension) =>
			isSoft(dimension),
		);

		if (allDimensionsAreSoft) return null;
		if (!canDefineLongestSide)
			throw new Error(
				"Failed to find longest side from an array of dimensions: either all or none of the objects must have the `soft` property set to `true`",
			);

		const longestSides = dimensions
			.map((dimension) => getLongestSideFromDimensions(dimension))
			.filter(
				(side): side is string => isNotNullLike(side) && side !== "",
			)
			.map((side) => Quantity(side));

		// * workaround for `Quantity.max()` requiring a known non-empty array
		// TODO: remove once `.max()` requires any array
		const [firstSide, ...remainingSides] = longestSides;

		if (!firstSide) return null;

		return Quantity.max(firstSide, ...remainingSides).toCompound(
			CANONICAL_UNITS.length,
			{
				precision: 0,
			},
		);
	}

	switch (dimensions.type) {
		case "rectangle":
			return CALCULATORS.rectangle.longestSide(dimensions);
		case "cylinder":
			return CALCULATORS.cylinder.longestSide(dimensions);
		case "area":
			return CALCULATORS.area.longestSide(dimensions);
		case "upperwear":
			return CALCULATORS.upperwear.longestSide();
		case "lowerwear":
			return CALCULATORS.lowerwear.longestSide();
	}
}

export { CANONICAL_UNITS, normalizeQuantityString };

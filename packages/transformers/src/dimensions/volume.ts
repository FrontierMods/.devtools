/**
 * @file Per-type `volume` calculators for `dimensions` objects, plus the shared final-volume fold (trim sequence × count).
 */

import { Quantity } from "../quantity.ts";
import type {
	RiseLabel,
	DimensionsArea,
	DimensionsCylinder,
	DimensionsLowerwear,
	DimensionsRectangle,
	DimensionsUpperwear,
} from "./schema.ts";

/**
 * Shapes of the `trim` accepted by the `dimensions` object.
 */
type Trim = number | number[];

/**
 * Map of common pant rise labels to their average lengths.
 *
 * Values are computed as quantities lazily to avoid performance overhead.
 */
const RISE = {
	low: "8 in", // * 7—9 in.
	mid: "10 in", // * 9—11 in.
	regular: "10 in", // * same as `mid`, another common term
	high: "12 in", // * >11 in.
} as const satisfies Record<RiseLabel, string>;

/**
 * Calculate final volume from the raw volume from dimensions.
 *
 * @param rawVolume Source volume quantity object to calculate from.
 * @param trim Decimal trim to apply, if any. (`trim` of `0.1` means "take 10% off".) If array, trim is applied sequentially: `[0.1, -0.025]` → "remove 10%, add 2.5%".
 * @param count Multiply final volume by this integer.
 *
 * @returns Volume Quantity object.
 */
function calculateFinalVolume(
	rawVolume: Quantity,
	trim: Trim,
	count = 1,
): Quantity {
	if (!Number.isInteger(count) || count <= 0)
		throw new Error(
			"`count` in a dimensions object must be a positive integer",
		);

	const trimmedVolume = (Array.isArray(trim) ? trim : [trim])
		.reduce(
			(accumulator, currentTrim) => accumulator.multiply(1 - currentTrim),
			rawVolume,
		)
		.multiply(count);

	return trimmedVolume;
}

/**
 * Calculate volume from a rectangle-flavored `dimensions` object.
 */
export function calculateRectangleVolume(
	dimensions: DimensionsRectangle,
): Quantity {
	const { width, height, length, trim = [0], quantity = 1 } = dimensions;

	const qWidth = Quantity(width);
	const qHeight = Quantity(height);
	const qLength = Quantity(length);

	const rawVolume = qWidth.multiply(qHeight).multiply(qLength);

	return calculateFinalVolume(rawVolume, trim, quantity);
}

/**
 * Calculate volume from a cylinder-flavored `dimensions` object.
 */
export function calculateCylinderVolume(
	dimensions: DimensionsCylinder,
): Quantity {
	const { diameter, length, trim = [0], quantity = 1 } = dimensions;

	const qDiameter = Quantity(diameter);
	const qLength = Quantity(length);

	const radiusSquared = qDiameter.divide(2).exponent(2);
	const rawVolume = radiusSquared.multiply(Math.PI).multiply(qLength);

	return calculateFinalVolume(rawVolume, trim, quantity);
}

/**
 * Calculate volume from a area-flavored `dimensions` object.
 */
export function calculateAreaVolume(dimensions: DimensionsArea): Quantity {
	const { area, length, trim = [0], quantity = 1 } = dimensions;

	const qArea = Quantity(area);
	const qLength = Quantity(length);

	const rawVolume = qArea.multiply(qLength);

	return calculateFinalVolume(rawVolume, trim, quantity);
}

/**
 * Calculate volume from a upperwear-flavored `dimensions` object.
 */
export function calculateUpperwearVolume(
	dimensions: DimensionsUpperwear,
): Quantity {
	const {
		chest,
		height,
		sleeve = Quantity(chest).multiply(0.57 /* ≈ 1 / 1.75 */),
		thickness,
		trim = [0],
		quantity = 1,
	} = dimensions;

	const isSleeveNull = sleeve === null;

	const qChest = Quantity(chest);
	const qHeight = Quantity(height).divide(2);
	const qThickness = Quantity(thickness);

	const qSleeve = isSleeveNull
		? Quantity("0 mm")
		: Quantity(sleeve).divide(3);

	const rawVolume = qChest
		.multiply(qHeight.add(qSleeve))
		.multiply(qThickness);

	return calculateFinalVolume(rawVolume, trim, quantity);
}

/**
 * Calculate volume from a lowerwear-flavored `dimensions` object.
 */
export function calculateLowerwearVolume(
	dimensions: DimensionsLowerwear,
): Quantity {
	const {
		inseam,
		rise,
		waist,
		thickness,
		trim = [0],
		quantity = 1,
	} = dimensions;

	const riseValue = RISE[rise] ?? rise;

	const qInseam = Quantity(inseam);
	const qRise = Quantity(riseValue);
	const qWaist = Quantity(waist);
	const qThickness = Quantity(thickness);

	const rawVolume = qInseam
		.multiply(2)
		.add(qRise)
		.multiply(qWaist)
		.multiply(qThickness);

	return calculateFinalVolume(rawVolume, trim, quantity);
}

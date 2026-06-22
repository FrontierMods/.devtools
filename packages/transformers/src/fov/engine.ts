/**
 * @file fov engine: converts a window or distance object into a field of view in minutes of angle (MoA).
 *
 * Default arm length for window calculations is 74.615 cm, the average between men's and women's arm lengths.
 * Reference: https://pmc.ncbi.nlm.nih.gov/articles/PMC8843142/
 */

import { Quantity } from "../quantity.ts";
import type {
	FoVDistanceObject,
	FoVObject,
	FoVWindowObject,
} from "./schema.ts";

/** Default window-viewing distance: the average between men's and women's arm lengths. */
const DEFAULT_ARM_LENGTH = "74.615 cm";

/** Distinguishes the distance shape (no `width`) from the window shape. */
function isFoVDistanceObject(fov: FoVObject): fov is FoVDistanceObject {
	return !("width" in fov);
}

/**
 * Calculate minutes of angle from a dimension seen across a distance.
 *
 * Formula: `MoA = (dimension / distance) * (180/π) * 60 / magnification`
 *
 * @param dimension - size of the object/view
 * @param distance - distance to the object
 * @param magnification - optical magnification factor
 */
function calculateMoA(
	dimension: Quantity,
	distance: Quantity,
	magnification = 1,
): Quantity {
	const ratio = dimension.divide(distance);
	const degrees = ratio.multiply(180 / Math.PI);
	const minutes = degrees.multiply(60);
	const adjusted = minutes.divide(magnification);

	return adjusted;
}

/** Field of view for a height viewed across an explicit distance. */
function calculateFoVFromDistance(fov: FoVDistanceObject): Quantity {
	const { distance, height, magnification = 1 } = fov;
	const qDistanceDouble = Quantity(distance).multiply(2);
	const qHeight = Quantity(height);

	return calculateMoA(qHeight, qDistanceDouble, magnification);
}

/** Field of view for a height/width aperture seen at a (defaulted) arm's length. */
function calculateFoVFromWindow(fov: FoVWindowObject): Quantity {
	const {
		height,
		width,
		distance = DEFAULT_ARM_LENGTH,
		magnification = 1,
	} = fov;

	const qHeight = Quantity(height);
	const qWidth = Quantity(width);
	const qDiagonal = qWidth.exponent(2).add(qHeight.exponent(2)).sqrt();
	const qDistanceDouble = Quantity(distance).multiply(2);

	return calculateMoA(qDiagonal, qDistanceDouble, magnification);
}

/** Dispatches to the distance or window calculation by input shape. */
export function calculateFoV(fov: FoVObject): Quantity {
	if (isFoVDistanceObject(fov)) return calculateFoVFromDistance(fov);

	return calculateFoVFromWindow(fov);
}

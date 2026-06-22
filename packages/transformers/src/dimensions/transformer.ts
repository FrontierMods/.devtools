/**
 * @file The `dimensions` transformer: computes `volume` (and `longest_side` when definable) from a `dimensions` object.
 *
 * @example
 * ```json5
 * dimensions: {
 *   type: "rectangle",
 *   length: "38 in",
 *   width: "2 in",
 *   height: "3 mm",
 * }
 * ```
 * @example
 * ```json5
 * dimensions: [
 *   {
 *     type: "upperwear",
 *     chest: "40 in",
 *     height: "13.5 in",
 *     thickness: "4 mm",
 *   },
 *   {
 *     type: "area",
 *     area: "227.89 in2",
 *     length: "0.23 in",
 *   },
 * ]
 * ```
 */

import {
	extractErrorMessage,
	isString,
	resolveObjectID,
} from "@frmds/frontier";
import type { Patch } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import {
	CANONICAL_UNITS,
	getLongestSideFromDimensions,
	getVolumeFromDimensions,
	normalizeQuantityString,
} from "./engine.ts";
import { DimensionsSchema, type Dimensions } from "./schema.ts";

/** The `dimensions` transformer: a `dimensions` object → `volume` (+ optional `longest_side`). */
const DIMENSIONS_TRANSFORMER: Transformer<Dimensions> = {
	name: "calculateDimensions",
	version: "3.0.0",
	api: "1.0.0",
	description: "Calculates volume and longest_side from dimensions objects",
	target: {
		paths: [["dimensions"]],
		content: DimensionsSchema,
		strict: true,
	},

	transform(dimensions, context): Patch[] {
		try {
			const qVolume = getVolumeFromDimensions(dimensions);
			const volume = qVolume.toCompound(CANONICAL_UNITS.volume);

			const { longest_side } = context.currentObject;

			const rawLongestSide = isString(longest_side)
				? longest_side
				: getLongestSideFromDimensions(dimensions);
			// * `rawLongestSide` can be an empty string
			const longestSide =
				isString(rawLongestSide) && rawLongestSide.length
					? normalizeQuantityString(rawLongestSide)
					: undefined;

			const patches: Patch[] = [
				{ op: "remove", path: [] },
				{ op: "insert", path: ["..", "volume"], value: volume },
			];

			if (longestSide)
				patches.push({
					op: "insert",
					path: ["..", "longest_side"],
					value: longestSide,
				});

			return patches;
		} catch (error) {
			const { id } = resolveObjectID(context.currentObject);

			throw new Error(
				`Dimensions Transformer: failed to calculate dimensions for \`${id}\`: ${extractErrorMessage(error)}`,
			);
		}
	},
};

export default DIMENSIONS_TRANSFORMER;

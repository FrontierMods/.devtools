/**
 * @file The `fov` transformer: computes a `field_of_view` in minutes of angle (MoA) from a window or distance object.
 *
 * @example
 * ```json5
 * // window: an aperture seen at (defaulted) arm's length
 * field_of_view: { height: "5 cm", width: "3 cm" }
 * ```
 * @example
 * ```json5
 * // distance: a height seen across an explicit distance
 * field_of_view: { height: "1.8 m", distance: "100 m" }
 * ```
 */

import { extractErrorMessage, resolveObjectID } from "@frmds/frontier";
import type { Patch } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import { calculateFoV } from "./engine.ts";
import { ContentSchema } from "./schema.ts";
import type { FoVObject } from "./schema.ts";

/** The `fov` transformer: a window/distance object at `field_of_view` → its MoA scalar. */
const FOV_TRANSFORMER: Transformer<FoVObject> = {
	name: "calculateFOV",
	version: "3.0.0",
	api: "1.0.0",
	description: "Calculates field of view in minutes of angle",
	target: { paths: [["field_of_view"]], content: ContentSchema },

	transform(raw, context): Patch[] {
		try {
			const fov = calculateFoV(raw);

			return [
				{ op: "replace", path: [], value: fov.toPrecision(1).scalar },
			];
		} catch (error) {
			const { id } = resolveObjectID(context.currentObject);

			throw new Error(
				`FOV Transformer: failed to calculate FOV for \`${id}\`: ${extractErrorMessage(error)}`,
			);
		}
	},
};

export default FOV_TRANSFORMER;

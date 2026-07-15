/**
 * @file Object-type exclusion lists consulted across the build pipeline.
 */

import { type ObjectType } from "@frmds/frontier";

/**
 * Object types that should be excluded from transformation pipeline but still loaded and output.
 *
 * These types have properties that interfere with transformers (e.g., `math` objects that aren't our math expressions), or contain template values that aren't valid until processed (e.g., `FUNCTION` with argument placeholders).
 */
export const TYPE_TRANSFORM_SKIP: ObjectType[] = [
	/**
	 * EOCs come with properties that may interfere with ours, like `math` objects.
	 */
	"effect_on_condition",
	/**
	 * Enchantments come with properties that may interfere with ours, like `math` objects.
	 */
	"enchantment",
	/**
	 * Functions contain template values (argument placeholders) that aren't valid until invocation.
	 */
	"FUNCTION",
	/**
	 * We currently cannot process mapgen objects due to the complexity of their IDs.
	 */
	"mapgen",
];

/**
 * Object types to never output.
 * These are internal types supporting transformer functionality and never valid *DDA* objects.
 */
export const EXCLUDED_OBJECT_TYPES = ["PARTIAL", "FUNCTION"];

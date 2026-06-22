/**
 * @file Object-type exclusion lists consulted across the build pipeline.
 */

import { type ObjectType } from "@frmds/frontier";

/**
 * Object types that cannot be loaded into registry at all.
 *
 * These types have special semantics (like multiple objects with same ID) that our system can't handle.
 */
export const TYPE_LOAD_SKIP: ObjectType[] = [
	/**
	 * Unable to correctly process additive conversation topic files.
	 * Our system, much like the base game's, requires one object per ID.
	 *
	 * It's possible to carve out a special case for this, but we're looking to avoid those.
	 */
	"talk_topic",
];

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
];

/**
 * Object types to never output.
 * These are internal types supporting transformer functionality and never valid *DDA* objects.
 */
export const EXCLUDED_OBJECT_TYPES = ["PARTIAL", "FUNCTION"];

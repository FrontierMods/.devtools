/**
 * @file The `magazine-pouch` transformer: computes pouch stats from a pocket's `magazine_pouch` config and injects them onto the pocket.
 *
 * @example
 * ```json5
 * magazine_pouch: {
 *   type: "I",
 *   capacity: 1,
 *   modifiers: ["TALL", "SOFT_RETAINER"],
 * }
 * ```
 */

import type { Patch } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import { assertValidConfig, calculateStats } from "./engine.ts";
import { ContentSchema } from "./schema.ts";
import type { PocketWithMagPouch } from "./types.ts";

/** The `magazine-pouch` transformer: a strict content gate on pockets carrying a `magazine_pouch` config → computed stats, with the config dropped. */
const MAGAZINE_POUCH_TRANSFORMER: Transformer<PocketWithMagPouch> = {
	name: "calculateMagazinePouch",
	version: "2.0.0",
	api: "1.0.0",
	description: "Calculates magazine pouch stats from configuration",
	target: { content: ContentSchema },

	// TODO: refactor to work on mag pouch configs directly?
	// * we can already add values to parents via patches
	transform(value, context) {
		const config = value.magazine_pouch;

		assertValidConfig(config, context);

		const computed = calculateStats(config);

		const patches: Patch[] = [];

		// * skip `null` values: the game schema treats an absent key and a present-but-null key differently, and only the former is valid
		for (const [key, val] of Object.entries(computed))
			if (value[key] === undefined && val !== null)
				patches.push({ op: "insert", path: [key], value: val });

		patches.push({ op: "remove", path: ["magazine_pouch"] });

		return patches;
	},
};

export default MAGAZINE_POUCH_TRANSFORMER;

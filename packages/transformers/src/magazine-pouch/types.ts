/**
 * @file Hand-authored pocket shapes the magazine-pouch transformer operates on. The strict config schema and accepted-value constants live in ./schema.ts.
 */

import type { JSONObject } from "@frmds/frontier";
import type { PouchModifier, PouchType } from "./schema.ts";

/** A magazine pouch configuration, as hand-authored on a pocket. */
export interface MagazinePouchConfig extends JSONObject {
	type: PouchType;
	capacity: number;
	modifiers?: PouchModifier[];
}

/**
 * A pocket data entry that may carry a magazine-pouch config.
 *
 * TODO: extract from the game schema.
 */
export interface Pocket extends JSONObject {
	magazine_pouch?: MagazinePouchConfig;
	volume_encumber_modifier?: number;
	ripoff?: number | null;
	moves?: number;
}

/** A pocket that carries a magazine-pouch config: the value this transformer matches. */
export interface PocketWithMagPouch extends Pocket {
	magazine_pouch: MagazinePouchConfig;
}

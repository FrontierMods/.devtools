/**
 * @file Hand-authored barter price index shapes. The strict gate schema and accepted-value constants live in ./schema.ts.
 */

import type { JSONObject } from "@frmds/frontier";
import type { ScoreInput } from "./schema.ts";

/** A barter price index as hand-authored at `price_postapoc`. */
export interface RawBarterPriceIndex extends JSONObject {
	utility: ScoreInput;
	longevity: ScoreInput;
	scarcity: ScoreInput;
}

/** A barter price index with its scores coerced to numbers. */
export interface BarterPriceIndex {
	utility: number;
	longevity: number;
	scarcity: number;
}

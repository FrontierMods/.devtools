/**
 * @file The `price` transformer: positional gate at `price_postapoc` over a strict barter-price index → a canonical price string.
 */

import { extractErrorMessage, resolveObjectID } from "@frmds/frontier";
import type { Patch } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import { calculateBarterPrice } from "./engine.ts";
import { ContentSchema } from "./schema.ts";
import type { RawBarterPriceIndex } from "./types.ts";

/** The `price` transformer: a strict index at `price_postapoc` → a canonical barter-price string. */
const PRICE_TRANSFORMER: Transformer<RawBarterPriceIndex> = {
	name: "calculatePrice",
	version: "2.0.0",
	api: "1.0.0",
	description: "Calculates barter price from index object",
	target: { paths: [["price_postapoc"]], content: ContentSchema },

	transform(raw, context): Patch[] {
		try {
			const price = calculateBarterPrice(raw);

			return [{ op: "replace", path: [], value: price }];
		} catch (error) {
			const { id } = resolveObjectID(context.currentObject);

			throw new Error(
				`Price Transformer: failed to calculate price for \`${id}\`: ${extractErrorMessage(error)}`,
			);
		}
	},
};

export default PRICE_TRANSFORMER;

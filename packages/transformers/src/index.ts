/**
 * @file Public barrel: each transformer is a named export a mod can declare, and `ALL_TRANSFORMERS` aggregates them for one-declaration imports.
 */

import type { Transformer } from "@frmds/autodoc";
import CANONICAL_TRANSFORMER from "./canonical/transformer.ts";
import DIMENSIONS_TRANSFORMER from "./dimensions/transformer.ts";
import FOV_TRANSFORMER from "./fov/transformer.ts";
import FUNCTION_TRANSFORMER from "./functions/transformer.ts";
import INHERITANCE_TRANSFORMER from "./inheritance/transformer.ts";
import ITEM_GROUP_VARIANTS_TRANSFORMER from "./item-group-variants/transformer.ts";
import MAGAZINE_POUCH_TRANSFORMER from "./magazine-pouch/transformer.ts";
import MATH_TRANSFORMER from "./math/transformer.ts";
import PATCH_TRANSFORMER from "./patch/transformer.ts";
import POCKET_MULTI_TRANSFORMER from "./pocket-multi/transformer.ts";
import PRICE_TRANSFORMER from "./price/transformer.ts";
import REFERENCE_TRANSFORMER from "./references/transformer.ts";
import VARIANTS_TRANSFORMER from "./variants/transformer.ts";

/** Every transformer this package ships. Each new transformer must be added here alongside its named export. */
const ALL_TRANSFORMERS: Transformer[] = [
	CANONICAL_TRANSFORMER,
	DIMENSIONS_TRANSFORMER,
	FOV_TRANSFORMER,
	FUNCTION_TRANSFORMER,
	INHERITANCE_TRANSFORMER,
	ITEM_GROUP_VARIANTS_TRANSFORMER,
	MAGAZINE_POUCH_TRANSFORMER,
	MATH_TRANSFORMER,
	PATCH_TRANSFORMER,
	POCKET_MULTI_TRANSFORMER,
	PRICE_TRANSFORMER,
	REFERENCE_TRANSFORMER,
	VARIANTS_TRANSFORMER,
];

export {
	ALL_TRANSFORMERS,
	CANONICAL_TRANSFORMER,
	DIMENSIONS_TRANSFORMER,
	FOV_TRANSFORMER,
	FUNCTION_TRANSFORMER,
	INHERITANCE_TRANSFORMER,
	ITEM_GROUP_VARIANTS_TRANSFORMER,
	MAGAZINE_POUCH_TRANSFORMER,
	MATH_TRANSFORMER,
	PATCH_TRANSFORMER,
	POCKET_MULTI_TRANSFORMER,
	PRICE_TRANSFORMER,
	REFERENCE_TRANSFORMER,
	VARIANTS_TRANSFORMER,
};

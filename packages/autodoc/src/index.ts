/**
 * @file Public host surface for externally-loaded transformers. An extracted transformer imports its Autodoc-provided contract only from here (`@frmds/autodoc`).
 */

/* # TRANSFORMER */

export type {
	ExecutionTarget,
	GameObject,
	PositionalTarget,
	TransformContext,
	Transformer,
	TransformerTarget,
	TraversalTarget,
} from "./types/types.ts";
export type {
	ObjectReadOptions,
	ObjectStoreReader,
} from "./object/store-view.ts";
export { createObjectsView } from "./object/store-view.ts";
export { TransformerSkip } from "./transformers/skip.ts";

/* # API VERSIONING */

export { AUTODOC_TRANSFORMER_API_VERSION } from "./api-version.ts";

/* # SCHEMA VALIDATION */

export { assertSchema } from "./schema.ts";

/* # UNIT MATHS */

export { CANONICAL_UNITS } from "./math/quantity.ts";
export type { SupportedKind } from "./math/quantity.ts";

/* # COMPOSITION */

export { getCompositionScope } from "./object/composition.ts";

# `@frmds/transformers`

`transformers` is the standard set of [Autodoc](../autodoc/README.md) transformers: the building blocks that compile a higher-level, composable, DRY mod source down into game-ready _Cataclysm: Dark Days Ahead_ JSON.

These transformers are not run on their own. Autodoc loads and runs them while building a mod, and each one is independent, so you declare only the ones you want.

## Install

```sh
bun add @frmds/transformers
```

## Usage

Declare the transformers under `autodoc.transformers` in your mod's `frontier.json5`. They run in declaration order:

```json5
autodoc: {
	transformers: [
		// every transformer this package ships
		{ package: "@frmds/transformers", export: "ALL_TRANSFORMERS" },

		// or a hand-picked subset, by export name
		{ package: "@frmds/transformers", export: ["MATH_TRANSFORMER", "PRICE_TRANSFORMER"] },
	],
}
```

Without any transformers declared, none run. You must specify which transformers Autodoc should use for the mod.

## Available transformers

Each transformer is independent and links to its own guide. Declare only the ones you want.

**[`CANONICAL_TRANSFORMER`](./src/canonical/README.md)**

Author in any unit system and ship clean metric.

```json5
{ weight: "2 lbs" } // → { weight: "907 g 185 mg" }
```

**[`DIMENSIONS_TRANSFORMER`](./src/dimensions/README.md)**

Describe an object's shape and get its volume and longest side.

```json5
// a shape's measurements become volume and longest_side
{ dimensions: { type: "cylinder", diameter: "2 in", length: "6 in" } }
```

**[`FOV_TRANSFORMER`](./src/fov/README.md)**

Derive an optic's field of view from a real aperture or distance.

```json5
{ field_of_view: { height: "1.8 m", distance: "100 m" } } // → 60
```

**[`FUNCTION_TRANSFORMER`](./src/functions/README.md)**

Define a parameterized template once, then stamp it out by call.

```json5
// `pals/columns` turns a webbing column count into a real width
{ width: { fn: "pals/columns", args: [2] } }
```

**[`INHERITANCE_TRANSFORMER`](./src/inheritance/README.md)**

Share one parent definition across a family of objects.

```json5
// pull in chassis's properties, override what differs
{ id: "vest", type: "ITEM", inherit: "chassis" }
```

**[`ITEM_GROUP_VARIANTS_TRANSFORMER`](./src/item-group-variants/README.md)**

Turn one spawn entry into a group per item variant.

```json5
// one group per variant, plus an `:any`
{ item: "vest", from: ["multicam", "black"] }
```

**[`MAGAZINE_POUCH_TRANSFORMER`](./src/magazine-pouch/README.md)**

Describe a pouch's design and get its computed pocket stats.

```json5
// a pouch design becomes encumbrance, ripoff, and moves
{ magazine_pouch: { type: "FLAP", capacity: 1 } }
```

**[`MATH_TRANSFORMER`](./src/math/README.md)**

Compute values with full unit awareness.

```json5
// quantity-aware: 50 g, doubled, converted to kg
{ math: ["50 g", { op: "multiply", value: 2 }, { op: "convert", value: "kg" }] }
// → "0.1 kg"
```

**[`PATCH_TRANSFORMER`](./src/patch/README.md)**

Apply structured edits to the object in place.

```json5
// append to an array without restating it
{ patch: [{ op: "append", key: "subtypes", value: "ARMOR" }] }
```

**[`POCKET_MULTI_TRANSFORMER`](./src/pocket-multi/README.md)**

Repeat an identical pocket by count.

```json5
// two identical pockets from one entry
{ pocket_type: "CONTAINER", multi: 2 }
```

**[`PRICE_TRANSFORMER`](./src/price/README.md)**

Rate an item by criteria and get a consistent barter price.

```json5
// rate by criteria, get a price off one shared curve
{ price_postapoc: { utility: "high", longevity: "high", scarcity: "high" } }
// → "51 USD"
```

**[`REFERENCE_TRANSFORMER`](./src/references/README.md)**

State a value once and point everything else at it.

```json5
// borrow stanag20's weight, so it tracks the source
{ weight: { ref: "stanag20", key: "weight" } }
```

**[`VARIANTS_TRANSFORMER`](./src/variants/README.md)**

Expand a list of names into an item's full variant set.

```json5
// each name becomes a full variant
{ from: ["multicam", ["black", 2]] }
```

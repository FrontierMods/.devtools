# `ITEM_GROUP_VARIANTS_TRANSFORMER`

Expands one `item_group` into a family of groups, one per item variant plus a catch-all, so a spawn list that should cover every colourway of an item comes from a single entry instead of a hand-written group for each.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

An `item_group` with exactly one entry carrying a `from` list. The entry names an `item`, and `from` lists the variants to build a group for:

- a bare ID string, which spawns at weight `1`
- an `[id, weight]` tuple, which sets the weight

The referenced item must exist and must declare every variant named in `from`. The group's own properties, like `subtype`, and the entry's other properties carry onto each generated group.

## Produces

The template group is removed and replaced with sibling groups: one per variant, each spawning the item with that `variant` set, plus an `:any` group that spawns the item with no variant fixed.

Generated IDs append the variant with a `:` separator, or a `/` separator when the base ID already contains a `:`.

## Example

```json5
// source
{
	id: "placard/onetigris/vulture",
	type: "item_group",
	subtype: "collection",
	entries: [
		{
			item: "placard/onetigris/vulture",
			from: ["multicam", "black", "coyote"],
		},
	],
}

// output: sibling groups, the template removed
//   placard/onetigris/vulture:any
//   placard/onetigris/vulture:multicam
//   placard/onetigris/vulture:black
//   placard/onetigris/vulture:coyote
```

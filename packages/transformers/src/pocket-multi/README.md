# `POCKET_MULTI_TRANSFORMER`

Duplicates a pocket a set number of times, so an item with several identical pockets is written once with a count instead of copied and pasted down the `pocket_data` array.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A pocket in `pocket_data` carrying a `multi` field, a positive integer for how many copies of the pocket the item should have.

## Produces

The pocket is replaced by `multi` copies of itself, each identical but with the `multi` field removed.

## Example

```json5
// source
{
	pocket_data: [
		{
			pocket_type: "CONTAINER",
			description: "Inner pocket",
			multi: 2,
		},
	],
}

// output
{
	pocket_data: [
		{
			pocket_type: "CONTAINER",
			description: "Inner pocket",
		},
		{
			pocket_type: "CONTAINER",
			description: "Inner pocket",
		},
	],
}
```

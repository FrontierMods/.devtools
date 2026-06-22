# `DIMENSIONS_TRANSFORMER`

Computes an item's `volume` and `longest_side` from the physical measurements of its shape, so you describe the object you are picturing instead of working volume out by hand and hoping the length looks right. Real measurements also keep related items in proportion to one another.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A `dimensions` object whose `type` picks a shape, with the measurements that shape needs. Every measurement is a quantity string like `"38 in"` or `"3 mm"`. Provide one shape, or an array of them to sum several pieces into one item.

### Shapes

- `rectangle`: a box from `width`, `height`, and `length`
- `cylinder`: a round body from `diameter` and `length`
- `area`: a known surface `area` times a `length`, for shapes that are neither boxy nor round
- `upperwear`: a torso garment from `chest`, `height`, `thickness`, and an optional `sleeve`
- `lowerwear`: a leg garment from `inseam`, `waist`, `thickness`, and a `rise` label of `low`, `mid`, `regular`, or `high`

### Shared options

Any shape may also carry:

- `trim`: a fraction of empty space to remove, so `0.1` shaves off 10%. A list applies several trims in turn.
- `soft`: marks the piece as flexible. In an array, either every piece is soft or none is.
- `quantity`: a positive integer, for that many identical pieces.

## Produces

The `dimensions` object is removed and replaced with:

- `volume`: always, summed across an array
- `longest_side`: when it can be determined. An item that declares its own `longest_side` keeps it, and an array of all-`soft` pieces has none, so the property is left off.

## Examples

A single boxy item:

```json5
// source
{
	dimensions: {
		type: "rectangle",
		length: "38 in",
		width: "2 in",
		height: "3 mm",
	},
}
```

An array, summing a garment panel and a flat area into one volume:

```json5
// source
{
	dimensions: [
		{
			type: "upperwear",
			chest: "40 in",
			height: "13.5 in",
			thickness: "4 mm",
		},
		{
			type: "area",
			area: "227.89 in2",
			length: "0.23 in",
		},
	],
}
```

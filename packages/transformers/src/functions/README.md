# `FUNCTION_TRANSFORMER`

Lets you define a reusable template once and stamp it out wherever you need it, with arguments filled in per call. It is the same idea as a function in code: write the shape of a value, then invoke it with different inputs instead of copying and editing the same block by hand.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

Two pieces: a function definition, and any number of invocations of it.

### The definition

A `FUNCTION` object naming its arguments and the template it returns:

- `type`: always `"FUNCTION"`
- `id`: the name invocations call by
- `args`: a list of `[name, type]` pairs. The type is one of `string`, `number`, `boolean`, `null`, `array`, or `object`, and each call is checked against it.
- `returns`: the template. Anywhere a `{ arg: "name" }` appears, the matching argument's value is substituted in.

A `FUNCTION` object is build-time only. It is never written to the game output.

### The invocation

An object with `fn` and `args`, placed anywhere a value is expected:

- `fn`: the function's `id`
- `args`: the values to bind, in the order the definition declares them. The count and types must match.

## Produces

The function's `returns` template with every `{ arg: ... }` filled in, in place of the invocation. A template may itself invoke other functions, or produce input for another transformer like [`math`](../math/README.md). Nested invocations resolve innermost first, so the result is fully expanded before the next transformer sees it.

## Examples

A measurement helper. PALS webbing comes in fixed-size columns, so a function turns a column count into the real width, sourced from one shared constant. Every pouch then derives its size the same way, and changing the constant reflows them all at once:

```json5
// definition
{
	id: "pals/columns",
	type: "FUNCTION",
	args: [["columns", "number"]],
	returns: {
		math: [
			{ ref: "@constants", path: ["size", "pals", "column"] },
			{ op: "multiply", value: { arg: "columns" } },
		],
	},
}

// use, on a pouch two columns wide
{ width: { fn: "pals/columns", args: [2] } }
```

A packaged formula. `dimensions/rectangle` multiplies length, width, and height into a volume, so an item states its measurements and lets the function do the arithmetic:

```json5
// definition
{
	id: "dimensions/rectangle",
	type: "FUNCTION",
	args: [
		["length", "string"],
		["width", "string"],
		["height", "string"],
	],
	returns: {
		math: [
			{ arg: "length" },
			{ op: "multiply", value: { arg: "width" } },
			{ op: "multiply", value: { arg: "height" } },
		],
	},
}

// use, sizing a pocket's capacity
{
	max_contains_volume: {
		fn: "dimensions/rectangle",
		args: ["1.25 in", "9 in", "5.5 in"],
	},
}
```

Functions compose. A function's `returns` may invoke another, so `dimensions/rectangle:trim` can build on `dimensions/rectangle` and shave off a percentage in one call. The innermost invocations resolve first, then the surrounding [`math`](../math/README.md) evaluates, leaving a single value behind.

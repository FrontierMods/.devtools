# `MATH_TRANSFORMER`

Computes a value from other values, with full awareness of units, so a number that is derived from something can stay derived instead of being copied and left to rot. Pair it with [`REFERENCE_TRANSFORMER`](../references/README.md) to base a calculation on another object's value.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A `math` expression: a base value followed by operations applied to it in order, left to right. There are two forms, identical in meaning, so you can pick whichever reads better:

- array shorthand: `{ math: [base, op1, op2, ...] }`
- object form: `{ math: base, ops: [op1, op2, ...] }`

The base is a number, a quantity string (like `"50 g"` or `"4 in"`), a reference object, or another nested `math` expression. An expression with a base and no operations resolves to the base.

Each operation is an object with an `op` and, for most, a `value`:

- `add`, `subtract`: `value` is a number or quantity. A quantity base needs a quantity value, and a unitless base needs a unitless value. The two cannot mix.
- `multiply`, `divide`: `value` is a number or quantity.
- `pow`: `value` is the exponent. A quantity may only be raised to an integer power.
- `root`: `value` is the degree, a positive integer.
- `sqrt`: no `value`.
- `convert`: `value` is the target unit, e.g. `"kg"`. The amount is recomputed into that unit.
- `round`: `value` is the number of decimal places, defaulting to `0` for whole numbers.
- `floor`, `ceil`: no `value`. Round down or up to a whole number.
- `toPrecision`: `value` is a count of significant figures, or a quantity string giving the precision step.
- `trim`: `value` is a fraction to remove, so `0.1` takes off 10%. Shorthand for multiplying by `1 - value`.
- `abs`: no `value`. The magnitude, dropping any sign.
- `invert`: no `value`. The reciprocal, `1 / x`.

## Produces

The computed scalar or quantity string in place of the object.

## Examples

Array shorthand, applied left to right:

```json5
// source: (100 * 2) + 50
{ math: [100, { op: "multiply", value: 2 }, { op: "add", value: 50 }] }

// output
250
```

Object form, quantity-aware with a unit conversion:

```json5
// source: 50 g, doubled, then converted
{
	math: "50 g",
	ops: [
		{ op: "multiply", value: 2 },
		{ op: "convert", value: "kg" },
	],
}

// output
"0.1 kg"
```

Trimming a quantity by a percentage:

```json5
// source: a length, reduced by 5%
{ math: ["20 cm", { op: "trim", value: 0.05 }] }

// output
"19 cm"
```

A reference as the base, so the result tracks its source:

```json5
// source: this item's authored length, times a factor
{
	math: [
		{ ref: "$", path: ["dimensions", "length"], raw: true },
		{ op: "multiply", value: 0.95 },
	],
}
```

Nesting a `math` expression inside an operation's `value`:

```json5
// source: one magazine's weight plus thirty rounds
{
	math: { ref: "stanag40", key: "weight" },
	ops: [
		{
			op: "add",
			value: {
				math: [
					{ ref: "556_round", key: "weight" },
					{ op: "multiply", value: 30 },
				],
			},
		},
	],
}
```

## Notes

- When the base does not yet resolve to a number or quantity, like a reference to an object built later, the expression is deferred and retried on a following pass, so ordering between objects takes care of itself.
- An empty `math` array is an error. Give at least a base value.

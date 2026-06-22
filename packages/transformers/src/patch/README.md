# `PATCH_TRANSFORMER`

Applies a list of edits to the object that carries them, so you can append to an array or tweak a nested value with a clear operation instead of restating the whole structure. It pairs well with [`inheritance`](../inheritance/README.md), letting a child add to a property it inherited rather than redeclaring it.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A `patch` array at the object's root. Each entry is one operation, written against the object itself:

- `op`: the operation to perform, such as `append`, `insert`, `replace`, or `remove`
- `key`: the top-level property to act on, the shorthand for a one-step path
- `path`: a deeper target, as a property list or a JSON Pointer string, when `key` is not enough
- `value`: the value the operation needs
- `from`: the source location, for operations that move or copy

Paths are written relative to the object, so you target `subtypes`, not the `patch` array around it.

## Produces

The object with every operation applied in order, and the `patch` array removed. An empty `patch` array is removed with no other effect.

## Example

```json5
// source
{
	id: "tac_gloves",
	subtypes: ["GLOVES"],
	patch: [{ op: "append", key: "subtypes", value: "ARMOR" }],
}

// output
{
	id: "tac_gloves",
	subtypes: ["GLOVES", "ARMOR"],
}
```

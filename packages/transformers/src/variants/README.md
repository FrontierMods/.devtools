# `VARIANTS_TRANSFORMER`

Expands one variant template into a full set of an item's variants, so a dozen colourways come from a single entry with a list of names instead of a dozen near-identical blocks you keep in sync by hand.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A template entry in an item's `variants` array carrying a `from` list. Each `from` entry names one variant to create:

- a bare ID string, which spawns at weight `1`
- an `[id, weight]` tuple, which sets the spawn weight

The template's other fields, like `name` and `description`, are copied onto every variant it produces. An optional `plural: true` marks the variant's description snippet as plural.

Variants you have already written out by hand, with their own `id` and no `from`, sit alongside the template untouched.

## Produces

The template is replaced, in place, by one variant per `from` entry. Each gets the entry's `id` and `weight`, `expand_snippets: true`, and the template's `description` with a `<variant:id>` suffix appended (or `<variant:id/plural>` when `plural` is set).

## Example

```json5
// source
{
	variants: [
		{
			description: "Low-profile plate carrier.",
			from: ["multicam", ["black", 2]],
		},
	],
}

// output
{
	variants: [
		{
			description: "Low-profile plate carrier.  <variant:multicam>",
			id: "multicam",
			weight: 1,
			expand_snippets: true,
		},
		{
			description: "Low-profile plate carrier.  <variant:black>",
			id: "black",
			weight: 2,
			expand_snippets: true,
		},
	],
}
```

# `REFERENCE_TRANSFORMER`

Pulls a value from another object, or from the current one, so you can state a fact once and point every other place at it. When the source changes, every reference follows, which keeps a mod free of values that silently drift apart.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

Any object carrying a `ref` string.

`ref` names the target by ID, or is `$` to point at the current object. On its own a reference resolves to the whole target object. The remaining fields narrow which object is found, pick a value out of it, and shape that value before it lands.

### Choosing the target

- `ref`: the target object's ID, or `$` for the object the reference sits on
- `type`: the game type to match (e.g. `ITEM`), for when an ID is shared across types
- `scope`: a specific mod ID to resolve against, instead of the current mod and its dependencies
- `raw`: when `true`, read the target as it was authored, before transformers ran on it. Defaults to `false`, which reads the finished object. Use `raw` to reach input-only properties that later transformers consume and remove.

### Picking a value out of the target

Use at most one. With neither, the whole object resolves.

- `key`: a single top-level property of the target
- `path`: a nested value, given as a list of keys from the target's root

### Shaping the result

- `filter`: an object of property matches, or a list of them. Against an extracted array it selects the one element that matches every filter, and errors if zero or more than one do. Against a single object it validates that the object matches, and errors otherwise.
- `patch`: patches applied to the extracted value before it resolves, for when you want most of the source but with edits

## Produces

The resolved value in place of the reference object.

## Examples

A single property, with `key`:

```json5
// source
{ weight: { ref: "stanag20", key: "weight" } }

// output: stanag20's `weight` value
```

A nested value, with `path`:

```json5
// match a pocket's capacity to another rig's first pocket
{
	pocket_data: [
		{
			pocket_type: "MAGAZINE",
			max_contains_volume: {
				ref: "chest_rig",
				path: ["pocket_data", 0, "max_contains_volume"],
			},
		},
	],
}
```

Narrowing with `type` and pinning a mod with `scope`:

```json5
// `type` picks the object kind when an ID is shared
// `scope` pins which mod to read from
{ weight: { ref: "canteen", type: "ITEM", scope: "dda", key: "weight" } }
```

Reaching the current object's own authored input with `$` and `raw`:

```json5
// `dimensions` is consumed and removed by another transformer, so read it raw
{ longest_side: { ref: "$", raw: true, path: ["dimensions", "length"] } }
```

Validating a single extracted value with `filter`:

```json5
// take the rig's first pocket, but only if it really is a magazine pocket
{
	pocket_data: [
		{
			ref: "chest_rig",
			path: ["pocket_data", 0],
			filter: { pocket_type: "MAGAZINE" },
		},
	],
}
```

Selecting one element out of an array with `filter`:

```json5
// source
{
	pocket_data: [
		{
			ref: "chest_rig",
			key: "pocket_data",
			filter: { pocket_type: "MAGAZINE" },
		},
	],
}

// output: the single `MAGAZINE` pocket from chest_rig
// errors if zero or several match
```

Borrowing a value and editing it with `patch`:

```json5
// take chest_rig's magazine pocket, then seal it
{
	pocket_data: [
		{
			ref: "chest_rig",
			key: "pocket_data",
			filter: { pocket_type: "MAGAZINE" },
			patch: [{ op: "insert", path: ["sealed"], value: true }],
		},
	],
}
```

## Notes

- Circular references are detected and reported with the full chain, so two objects cannot point at each other forever.
- A non-self reference becomes a build dependency, so the target is always resolved first.

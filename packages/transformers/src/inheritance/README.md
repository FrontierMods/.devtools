# `INHERITANCE_TRANSFORMER`

Pulls a parent object's properties into a child, so a family of related objects can share one definition and each child only states what makes it different. It works like the game's `copy-from`, but resolves at build time, reaches across your mod's dependencies, and accepts more than one parent.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

An `inherit` prop at the object's root, naming one or more parents. Every property the parent declares and the child does not is copied onto the child. Properties the child already declares are left untouched, so the child always wins.

`inherit` takes any of:

- a bare ID string: `inherit: "chassis"`
- a spec object that narrows the lookup: `inherit: { id: "chassis", type: "ITEM", scope: "dda" }`
- a non-empty array of either, for multiple parents: `inherit: ["chassis", "@armor_plating"]`

The spec object's fields:

- `id`: the parent's ID (required)
- `type`: the game type to match, for when an ID is shared across types. Without it, a single match is found by ID alone, and an ID that matches several types is an error asking you to name one.
- `scope`: a specific mod to look in. Defaults to the current mod and its dependencies.

With several parents, they are merged left to right, so a later parent overrides an earlier one, and the child still overrides them all.

## Produces

The child object with every inherited property inserted, and the `inherit` directive removed. The merge is shallow: a property is taken whole or not at all.

## Examples

A bare ID, inheriting the parent's missing properties:

```json5
// parent `chassis`: { material: "cotton", weight: "1 kg" }

// source
{ id: "vest", type: "ITEM", inherit: "chassis" }

// output
{ id: "vest", type: "ITEM", material: "cotton", weight: "1 kg" }
```

A spec narrowing the parent by type and mod:

```json5
{
	id: "vest",
	type: "ITEM",
	inherit: { id: "chassis", type: "ITEM", scope: "dda" },
}
```

Several parents, merged in order with the child on top:

```json5
{ id: "vest", type: "ITEM", inherit: ["chassis", "@armor_plating"] }
```

Overriding a base-game object by re-declaring it and inheriting its original. Because the child shares the parent's `id`, the lookup hoists past your mod to the base game, exactly as `copy-from` does:

```json5
// keep the base game's `bags_unisex` contents, but change its subtype
{
	id: "bags_unisex",
	type: "item_group",
	subtype: "distribution",
	inherit: "bags_unisex",
}
```

## Notes

- A same-ID inherit always resolves the base definition, not your own re-declaration, so it never inherits from itself.
- Each parent is a build dependency, so it is always resolved before the child.

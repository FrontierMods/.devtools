# `MAGAZINE_POUCH_TRANSFORMER`

Turns a short description of a magazine pouch's design into the pocket stats the game needs, so you describe the pouch you have in mind instead of hand-tuning encumbrance, retention, and draw time until they feel right. Every pouch built this way stays consistent with the rest.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A `magazine_pouch` config on a pocket, describing the pouch by its closure, how many magazines it holds, and any construction details.

### `type`: the pouch's closure, trading draw speed against security

Each type can be written as a number, a Roman numeral, or a label. The three are the same value.

- `1`, `I`, or `OPEN`: open top. The fastest to draw from, and the least secure.
- `2`, `II`, or `FLAP`: a flap over the opening. A balance of speed and security.
- `3`, `III`, or `BUCKLE`: a buckled flap. The slowest to draw from, and secure enough to prevent items from falling out of it.

### `capacity`: how many magazines the pouch holds

A positive integer. More magazines slow the draw in proportion to the pouch type.

### `modifiers`: optional construction details

Each modifier stands for a real feature of the pouch and nudges its stats. Apply any that fit.

- `SHORT`: cut down to expose more of the magazine. Quicker to draw, a little less secure.
- `TALL`: extended to cover more of the magazine. Slower to draw, more secure, a touch sleeker.
- `SOFT_RETAINER`: an elastic or bungee retainer. A little more secure, slightly slower.
- `HARD_RETAINER`: a rigid molded retainer gripping the magazine. Much sleeker and more secure, and still quick to draw.
- `BUTTON_RETAINER`: a snap-button retention tab. More secure, slightly slower. Valid only on a `FLAP` (type II) pouch.

`SHORT` and `TALL` are opposites and cannot be combined, and neither can `SOFT_RETAINER` and `HARD_RETAINER`.

## Produces

The pocket with three computed stats inserted, and the `magazine_pouch` config removed:

- `volume_encumber_modifier`: how much the loaded pouch adds to encumbrance for its volume
- `ripoff`: how firmly the magazine is held against being torn away. A `BUCKLE` pouch has none, so the stat is left off entirely.
- `moves`: the time to draw a magazine from the pouch

A stat the pocket already declares is left as written, so you can override any single value by hand.

## Examples

A flap pouch holding one magazine:

```json5
// source
{
	pocket_data: [
		{
			pocket_type: "MAGAZINE",
			magazine_pouch: { type: "FLAP", capacity: 1 },
		},
	],
}

// output
{
	pocket_data: [
		{
			pocket_type: "MAGAZINE",
			volume_encumber_modifier: 2,
			ripoff: 20,
			moves: 130,
		},
	],
}
```

A buckled pouch, where `ripoff` is omitted:

```json5
// source
{
	pocket_data: [
		{
			pocket_type: "MAGAZINE",
			magazine_pouch: { type: "BUCKLE", capacity: 1 },
		},
	],
}

// output
{
	pocket_data: [
		{
			pocket_type: "MAGAZINE",
			volume_encumber_modifier: 1,
			moves: 170,
		},
	],
}
```

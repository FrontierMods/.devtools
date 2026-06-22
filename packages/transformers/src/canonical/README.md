# `CANONICAL_TRANSFORMER`

Normalizes a quantity you wrote in whatever unit was handy into the game's canonical form, so you can author a weight in pounds or a length in inches and still ship consistent, tidy metric values. It also rounds away false precision, since the game stores these as whole units.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A quantity string at any of the item fields the game measures, such as `weight`, `volume`, `longest_side`, their `integral_` forms, the time fields (`spoils_in`, `brew_time`, `install_time`, and the like), the price fields, and the matching `pocket_data` capacity fields.

Each field has a known kind (mass, volume, length, time, or currency), which is how an ambiguous unit suffix is read correctly. The letter `m` is minutes at a time field and metres at a length field, and `t` is tonnes at a mass field. The field decides, so there is never a guess.

Only these known fields are touched. A quantity string anywhere else is left alone.

## Produces

The same value rewritten in canonical compound metric form, rounded to whole units. A value already in canonical form is left untouched.

## Examples

Authoring in imperial, shipping metric:

```json5
// source
{
	weight: "2 lbs",
	longest_side: "7.5 in",
	volume: "1 gal",
}

// output
{
	weight: "907 g 185 mg",
	longest_side: "19 cm 1 mm",
	volume: "3 L 785 ml",
}
```

The field's kind resolves an ambiguous unit. At a time field, `m` is minutes, not metres:

```json5
// source
{ spoils_in: "5.5 m" }

// output
{ spoils_in: "5 minute 30 second" }
```

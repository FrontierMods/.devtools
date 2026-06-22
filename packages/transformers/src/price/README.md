# `PRICE_TRANSFORMER`

Calculates an item's post-apocalypse barter price from a three-axis rating, so you score an item by what it is worth to a survivor instead of guessing a currency value. The scores feed a fixed curve, which keeps prices consistent across every item that uses it.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A `price_postapoc` object rating the item on three axes. Each axis takes an integer `0`–`3`, or its matching case-insensitive label: `none` (0), `low` (1), `medium` (2), `high` (3).

### `utility`: how useful the item is to a survivor

- `0` or `none`: no practical use, like decoration, a broken or spent object, or pure clutter
- `1` or `low`: marginal or situational use, works in a pinch and is easily substituted
- `2` or `medium`: solidly useful, a tool or item you would keep and reach for regularly
- `3` or `high`: essential or life-saving, a reliable weapon, medicine, or a key tool

### `longevity`: how well the item survives use and time

- `0` or `none`: single-use or quick to perish, spoils fast or breaks after one use
- `1` or `low`: wears out quickly, fragile, short shelf life, or in frequent need of repair
- `2` or `medium`: holds up under normal care and lasts a good while before failing
- `3` or `high`: near-indestructible and shelf-stable, keeps almost indefinitely

### `scarcity`: how hard the item is to come by

- `0` or `none`: everywhere, common scrap, mass-produced goods, or trivially crafted
- `1` or `low`: easy to find, turns up in most of the places you would look
- `2` or `medium`: uncommon, takes searching to find or real effort to make
- `3` or `high`: rare, seldom found and seldom crafted, a genuine score

## Produces

A canonical currency string in place of the object. The three scores are summed and mapped through a fixed curve, so any two items rated the same are always priced the same.

## Example

```json5
// source: a useful, durable, hard-to-find item
{ price_postapoc: { utility: "high", longevity: "high", scarcity: "high" } }

// output
{ price_postapoc: "51 USD" }
```

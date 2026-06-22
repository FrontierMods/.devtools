# `FOV_TRANSFORMER`

Computes a `field_of_view` in minutes of angle from a physical setup you can actually picture, so an optic's FoV comes from its aperture and magnification rather than a bare number you reverse-engineered to feel right.

Part of [`@frmds/transformers`](../../README.md), run by [Autodoc](../../../autodoc/README.md).

## Consumes

A `field_of_view` object in one of two shapes.

### Window: an aperture seen at arm's length

You look through an opening of a given `height` and `width`. The viewing distance defaults to arm's length.

- `height`, `width`: the aperture's size
- `distance`: an explicit viewing distance, instead of the arm's-length default
- `magnification`: optional optical magnification, which narrows the view

### Distance: a height seen across a distance

An object of a known `height` viewed across an explicit `distance`.

- `height`: the viewed object's height
- `distance`: how far away it is
- `magnification`: optional optical magnification, which narrows the view

## Produces

A single number, the field of view in minutes of angle, in place of the object. A higher magnification yields a smaller number.

## Examples

A window aperture at the default arm's length:

```json5
// source
{ field_of_view: { height: "5 cm", width: "3 cm" } }
```

A target height across an explicit distance:

```json5
// source
{ field_of_view: { height: "1.8 m", distance: "100 m" } }

// output
{ field_of_view: 60 }
```

/**
 * @file Schemas and derived shapes for the `fov` transformer's `field_of_view` gate. The schemas are the single source of truth: each authoring shape derives from its schema via `Static`.
 */

import { Type } from "typebox";
import type { Static } from "typebox";

/** Either FoV authoring shape accepted by the transformer. */
export type FoVObject = FoVWindowObject | FoVDistanceObject;

/** A scope looked at through a window: a height/width aperture at arm's length. */
export type FoVWindowObject = Static<typeof WindowSchema>;

/** An object viewed at a distance: a height seen across an explicit distance. */
export type FoVDistanceObject = Static<typeof DistanceSchema>;

/** A scope looked at through a window: a height/width aperture at a (defaulted) arm's-length distance. */
export const WindowSchema = Type.Object(
	{
		height: Type.String(),
		width: Type.String(),
		distance: Type.Optional(Type.String()),
		magnification: Type.Optional(Type.Number()),
	},
	{ additionalProperties: false },
);

/** An object viewed at a distance: a height seen across an explicit distance. */
export const DistanceSchema = Type.Object(
	{
		height: Type.String(),
		distance: Type.String(),
		magnification: Type.Optional(Type.Number()),
	},
	{ additionalProperties: false },
);

/** The transformer's input gate: either FoV authoring shape. A `field_of_view` already resolved to a number falls outside this and is left untouched. */
export const ContentSchema = Type.Union([WindowSchema, DistanceSchema]);

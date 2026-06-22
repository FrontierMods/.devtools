/**
 * @file `dimensions` shapes: per-type schemas (the transformer's `content` gate) and their derived types.
 */

// oxlint-disable frontier-style/require-jsdoc
import { Type, type Static } from "typebox";

export type DimensionsType = Static<typeof DimensionObjectSchema>["type"];

export type DimensionsRectangle = Static<typeof DimensionsRectangleSchema>;
export type DimensionsCylinder = Static<typeof DimensionsCylinderSchema>;
export type DimensionsArea = Static<typeof DimensionsAreaSchema>;
export type DimensionsUpperwear = Static<typeof DimensionsUpperwearSchema>;
export type DimensionsLowerwear = Static<typeof DimensionsLowerwearSchema>;
export type DimensionObject = Static<typeof DimensionObjectSchema>;
export type Dimensions = Static<typeof DimensionsSchema>;
/**
 * One of the common pant rise labels.
 */
export type RiseLabel = (typeof RISE_LABELS)[number];

/**
 * Common labels to describe pant rise.
 */
const RISE_LABELS = ["low", "mid", "regular", "high"] as const;

const RiseSchema = Type.Enum(RISE_LABELS);

/**
 * Base fields shared by all dimension types
 */
const BaseDimensionSchema = Type.Object({
	trim: Type.Optional(Type.Union([Type.Number(), Type.Array(Type.Number())])),
	soft: Type.Optional(Type.Boolean()),
	quantity: Type.Optional(Type.Integer({ minimum: 1 })),
});

/**
 * Rectangle: width × height × length
 */
export const DimensionsRectangleSchema = Type.Interface([BaseDimensionSchema], {
	type: Type.Literal("rectangle"),
	width: Type.String(),
	height: Type.String(),
	length: Type.String(),
});

/**
 * Cylinder: π × (diameter/2)² × length
 */
export const DimensionsCylinderSchema = Type.Interface([BaseDimensionSchema], {
	type: Type.Literal("cylinder"),
	diameter: Type.String(),
	length: Type.String(),
});

/**
 * Area: area × length
 */
export const DimensionsAreaSchema = Type.Interface([BaseDimensionSchema], {
	type: Type.Literal("area"),
	area: Type.String(),
	length: Type.String(),
});

/**
 * Upperwear: chest × (height/2 + sleeve/3) × thickness
 */
export const DimensionsUpperwearSchema = Type.Interface([BaseDimensionSchema], {
	type: Type.Literal("upperwear"),
	chest: Type.String(),
	height: Type.String(),
	thickness: Type.String(),
	sleeve: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

/**
 * Lowerwear: (inseam×2 + rise) × waist × thickness
 */
export const DimensionsLowerwearSchema = Type.Interface([BaseDimensionSchema], {
	type: Type.Literal("lowerwear"),
	inseam: Type.String(),
	rise: RiseSchema,
	waist: Type.String(),
	thickness: Type.String(),
});

/**
 * Union of all dimension object types (discriminated by 'type' field)
 */
export const DimensionObjectSchema = Type.Union([
	DimensionsRectangleSchema,
	DimensionsCylinderSchema,
	DimensionsAreaSchema,
	DimensionsUpperwearSchema,
	DimensionsLowerwearSchema,
]);

export const DimensionsSchema = Type.Union([
	DimensionObjectSchema,
	Type.Array(DimensionObjectSchema, { minItems: 1 }),
]);

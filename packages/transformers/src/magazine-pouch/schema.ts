/**
 * @file Strict schemas and accepted-value constants for the magazine-pouch transformer.
 *
 * The type constants are the single source of truth: domain types and runtime schemas both derive from them, so a gate can never drift from the values it accepts.
 */

import { Type } from "typebox";

/** Pouch type expressed as a number (canonical). */
export type NumericPouchType = (typeof NUMERIC_POUCH_TYPES)[number];

/** Magazine pouch type, in any of the accepted formats. */
export type PouchType =
	| (typeof NUMERIC_POUCH_TYPES)[number]
	| (typeof ROMAN_POUCH_TYPES)[number]
	| (typeof LABEL_POUCH_TYPES)[number];

/** A modifier label accepted on a pouch config. */
export type PouchModifier = (typeof MODIFIER_NAMES)[number];

/** Pouch types as canonical numbers. */
export const NUMERIC_POUCH_TYPES = [1, 2, 3] as const;
/** Pouch types as Roman numerals; aligns with the numeric list. */
export const ROMAN_POUCH_TYPES = ["I", "II", "III"] as const;
/** Pouch types as labels; aligns with the numeric list. */
export const LABEL_POUCH_TYPES = ["OPEN", "FLAP", "BUCKLE"] as const;

/** Accepted modifier names; the engine's effect table is keyed by exactly these. */
export const MODIFIER_NAMES = [
	"SHORT",
	"TALL",
	"SOFT_RETAINER",
	"HARD_RETAINER",
	"BUTTON_RETAINER",
] as const;

/** Accepted `type` values, derived from the type lists so the gate cannot drift from {@link PouchType}. */
export const PouchTypeSchema = Type.Union(
	[...NUMERIC_POUCH_TYPES, ...ROMAN_POUCH_TYPES, ...LABEL_POUCH_TYPES].map(
		(type) => Type.Literal(type),
	),
);

/** Accepted `modifiers` entries, derived from {@link MODIFIER_NAMES}. */
export const PouchModifierSchema = Type.Union(
	MODIFIER_NAMES.map((modifier) => Type.Literal(modifier)),
);

/** Strict shape of a `magazine_pouch` config: exactly `type`, `capacity`, and optional `modifiers`, no extra keys. Cross-field rules (mutual exclusivity, `BUTTON_RETAINER` only on type II) live in the engine, since a schema cannot express them. */
export const MagazinePouchConfigSchema = Type.Object(
	{
		type: PouchTypeSchema,
		capacity: Type.Integer({ minimum: 1 }),
		modifiers: Type.Optional(Type.Array(PouchModifierSchema)),
	},
	{ additionalProperties: false },
);

/** Gate: a pocket carrying a strict `magazine_pouch` config. The pocket itself stays open. */
export const ContentSchema = Type.Object(
	{ magazine_pouch: MagazinePouchConfigSchema },
	{ additionalProperties: true },
);

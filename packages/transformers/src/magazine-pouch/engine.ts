/**
 * @file magazine-pouch engine: validates a config and computes the pouch stats injected onto the pocket.
 */

import { keys } from "@frmds/frontier";
import type { TransformContext } from "@frmds/autodoc";
import {
	LABEL_POUCH_TYPES,
	NUMERIC_POUCH_TYPES,
	ROMAN_POUCH_TYPES,
	type NumericPouchType,
	type PouchModifier,
	type PouchType,
} from "./schema.ts";
import type { MagazinePouchConfig } from "./types.ts";

/** Computed properties injected into a pocket. */
interface ComputedPouchStats {
	volume_encumber_modifier: number;
	ripoff: number | null;
	moves: number;
}

/** A single modifier's effect on the computed stats. */
interface ModifierEffect {
	encumber: number;
	ripoff: number;
	moves: number | ((type: NumericPouchType) => number);
}

/** Base stat values by pouch type. */
const BASE_VALUES = {
	1: {
		volume_encumber_modifier: 1.5,
		ripoff: 6,
		moves: 60,
	},
	2: {
		volume_encumber_modifier: 2.0,
		ripoff: 20,
		moves: 110,
	},
	3: {
		volume_encumber_modifier: 1.0,
		ripoff: null,
		moves: 140,
	},
} satisfies Record<NumericPouchType, ComputedPouchStats>;

/** Per-magazine moves cost by pouch type. */
const MOVES_PER_MAGAZINE = {
	1: 10,
	2: 20,
	3: 30,
} satisfies Record<NumericPouchType, number>;

/** Effects applied by each modifier. Keyed by exactly the accepted modifier names. */
const MODIFIER_EFFECTS = {
	SHORT: {
		encumber: 0.1,
		ripoff: -1,
		moves: (type): number => -MOVES_PER_MAGAZINE[type],
	},
	TALL: {
		encumber: -0.1,
		ripoff: 2,
		moves: (type): number => MOVES_PER_MAGAZINE[type],
	},
	SOFT_RETAINER: {
		encumber: -0.05,
		ripoff: 1,
		moves: 10,
	},
	HARD_RETAINER: {
		encumber: -0.25,
		ripoff: 3,
		moves: -20,
	},
	BUTTON_RETAINER: {
		encumber: 0,
		ripoff: 5,
		moves: 10,
	},
} satisfies Record<PouchModifier, ModifierEffect>;

/** List of valid modifiers applicable to pouches. */
const VALID_MODIFIERS = keys(MODIFIER_EFFECTS);

/**
 * Map of mutually exclusive modifiers.
 * We can safely assume that if two conflicting modifiers are on the list, the modifier used as key for the map will by definition be on the list.
 */
const EXCLUSIVE_MODIFIERS = new Map<PouchModifier, PouchModifier[]>([
	["SHORT", ["TALL"]],
	["SOFT_RETAINER", ["HARD_RETAINER"]],
]);

/**
 * Coerce magazine pouch type to numeric value for further processing.
 */
function coerceType(type: PouchType): NumericPouchType {
	if (typeof type === "number") {
		if (NUMERIC_POUCH_TYPES.includes(type)) return type;

		throw new Error(
			`Invalid magazine pouch type: ${type}\n` +
				`Must be one of: ${[
					...NUMERIC_POUCH_TYPES,
					...ROMAN_POUCH_TYPES,
					...LABEL_POUCH_TYPES,
				].join(", ")}`,
		);
	}

	// * string values fall through to here
	const normalized = type.toUpperCase();

	switch (normalized) {
		case "I":
		case "OPEN":
			return 1;
		case "II":
		case "FLAP":
			return 2;
		case "III":
		case "BUCKLE":
			return 3;
		default:
			throw new Error(
				`Invalid magazine pouch type: ${type}\n` +
					`Must be one of: ${[
						...NUMERIC_POUCH_TYPES,
						...ROMAN_POUCH_TYPES,
						...LABEL_POUCH_TYPES,
					].join(", ")}`,
			);
	}
}

/**
 * Adjust ripoff value by delta, preserving `null` and clamping to a minimum of 1.
 */
function adjustRipoff(ripoff: number | null, delta: number): number | null {
	if (ripoff === null) return null;

	return Math.max(ripoff + delta, 1);
}

/**
 * Validates all provided pouch modifiers. Modifiers are optional, so an absent list is valid (nothing to check).
 */
function validatePouchModifiers(
	modifiers: PouchModifier[] | undefined,
	type: NumericPouchType,
): void {
	if (!modifiers) return;

	for (const modifier of modifiers)
		if (!VALID_MODIFIERS.includes(modifier))
			throw new Error(
				`validatePouchModifiers(): Unknown modifier: "${modifier}"\n` +
					`Valid modifiers: ${VALID_MODIFIERS.join(", ")}`,
			);

	for (const modifier of modifiers) {
		const exclusiveWith = EXCLUSIVE_MODIFIERS.get(modifier);

		if (!exclusiveWith) continue;

		for (const conflicting of exclusiveWith) {
			if (!modifiers.includes(conflicting)) continue;

			throw new Error(
				`validatePouchModifiers(): Mutually exclusive modifiers: ${modifier} and ${conflicting}\n` +
					`Use one or the other, not both`,
			);
		}
	}

	// TODO: generalize detection of these types of conflicts
	if (modifiers.includes("BUTTON_RETAINER") && type !== 2)
		throw new Error(
			`validatePouchModifiers(): \`BUTTON_RETAINER\` is only valid with type II pouches\n` +
				`Current type: ${type}`,
		);
}

/**
 * Calculates magazine pouch stats from provided configuration.
 */
export function calculateStats(
	config: MagazinePouchConfig,
): ComputedPouchStats {
	const type = coerceType(config.type);
	const modifiers = config.modifiers || [];

	const {
		volume_encumber_modifier: baseEncumbrance,
		ripoff: baseRipoff,
		moves: baseMoves,
	} = BASE_VALUES[type];

	const volume_encumber_modifier = modifiers.reduce(
		(accumulator, modifier) =>
			accumulator + MODIFIER_EFFECTS[modifier].encumber,
		baseEncumbrance,
	);
	const ripoff = modifiers.reduce(
		(accumulator, modifier) =>
			adjustRipoff(accumulator, MODIFIER_EFFECTS[modifier].ripoff),
		baseRipoff,
	);
	const moves = modifiers.reduce(
		(accumulator, modifier) => {
			const effect = MODIFIER_EFFECTS[modifier];

			const delta =
				typeof effect.moves === "function"
					? effect.moves(type)
					: effect.moves;

			return accumulator + delta;
		},
		baseMoves + MOVES_PER_MAGAZINE[type] * config.capacity,
	);

	return {
		// * round for precision
		volume_encumber_modifier:
			Math.round(volume_encumber_modifier * 100) / 100,
		// * `null` ripoff is deliberate (e.g. buckle pouches): it means "no ripoff value"
		// * it is dropped on insert rather than coerced, since the game schema accepts only a number or an absent key
		ripoff,
		moves,
	};
}

/**
 * Validate complete configuration - throws descriptive error on failure
 */
export function assertValidConfig(
	config: MagazinePouchConfig,
	context: TransformContext,
): void {
	const type = coerceType(config.type);

	if (!Number.isInteger(config.capacity) || config.capacity < 1)
		throw new Error(
			`Invalid magazine pouch capacity: ${config.capacity}\n` +
				`  at: ${context.modId}:${context.sourcePath}\n` +
				`  Capacity must be a positive integer`,
		);

	validatePouchModifiers(config.modifiers, type);
}

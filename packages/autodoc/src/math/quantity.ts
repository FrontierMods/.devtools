/**
 * @file Quantity normalization for game compatibility: converts quantity strings to metric, rounds to whole numbers, and formats compounds like `2 L 668 ml`.
 */

import type { UnitEntry } from "@quantities/core";
import { createRegistry, withRegistry } from "@quantities/registry";
import toCompoundExtension from "@quantities/to-compound";

/**
 * Augmented Quantity.
 */
type Quantity = ReturnType<typeof Quantity>;

/**
 * One quantity kind the normalizer supports.
 */
export type SupportedKind = (typeof SUPPORTED_KINDS)[number];

/**
 * Game-specific time units registered on top of the default registry, so source may express durations in the game's own clock: 1 turn = 1 second, 1 move = 10 milliseconds.
 */
const GAME_TIME_UNITS: UnitEntry[] = [
	{
		key: "<turn>",
		aliases: ["turn", "turns"],
		scalar: 1,
		kind: "time",
		numerator: ["<second>"],
	},
	{
		key: "<move>",
		aliases: ["move", "moves"],
		scalar: 10,
		kind: "time",
		numerator: ["<milli>", "<second>"],
	},
];

/**
 * The `@quantities` base bound to a registry carrying {@link GAME_TIME_UNITS} and extended with `.toCompound()`.
 */
const Quantity = withRegistry(createRegistry(GAME_TIME_UNITS)).default.extend(
	toCompoundExtension,
);

/**
 * Quantity kinds the normalizer handles.
 */
const SUPPORTED_KINDS = [
	"mass",
	"length",
	"volume",
	"time",
	"currency",
] as const;

/**
 * Game-normalized units for each kind.
 * Time uses clock units (weeks to seconds) for human-readable times.
 */
const CANONICAL_UNITS: Record<SupportedKind, string[]> = {
	mass: ["kg", "g", "mg"],
	length: ["km", "meter", "cm", "mm"],
	volume: ["L", "ml"],
	time: ["week", "day", "hour", "minute", "second"],
	currency: ["kUSD", "USD", "cents"],
};

export { CANONICAL_UNITS, Quantity };

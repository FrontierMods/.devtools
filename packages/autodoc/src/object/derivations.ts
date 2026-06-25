/**
 * @file Runtime property derivations: rules that compute implied properties and append them as a `derive` step.
 */

import {
	appendEntry,
	type CompoundKey,
	entries,
	extractErrorMessage,
	type GameObject,
	type JSONObject,
	type JSONValue,
	logger,
	fromEntries,
	type Patch,
	type Timeline,
} from "@frmds/frontier";
import { CANONICAL_UNITS, Quantity } from "../math/quantity.ts";

/**
 * Object with a string `volume` property and no explicit `longest_side`.
 */
type ObjectWithVolume = GameObject & { volume: string };

/**
 * A runtime property derivation.
 */
interface RuntimeDerivation<TObject extends JSONObject = JSONObject> {
	/** Identifier for this derivation, used in debug logs. */
	name: string;
	/** Narrows an object to the shape this derivation applies to. */
	check(object: JSONObject): object is TObject;
	/** Computes the derived properties for a narrowed object, or `undefined` when none apply. */
	derive(object: TObject): Partial<JSONObject> | undefined;
}

/**
 * Child logger scoped to derivations.
 */
const LOGGER = logger.getChild("derivations");

/**
 * Derives `longest_side` as the cube root of `volume`, rounded to the nearest whole centimeter, when the object does not specify `longest_side`.
 */
const LONGEST_SIDE_FROM_VOLUME: RuntimeDerivation<ObjectWithVolume> = {
	name: "longest_side_from_volume",

	check(object: GameObject): object is ObjectWithVolume {
		return (
			"volume" in object &&
			!("longest_side" in object) &&
			typeof object.volume === "string"
		);
	},

	derive(object: ObjectWithVolume): Partial<GameObject> | undefined {
		try {
			const volume = Quantity(object.volume).toBase();
			// * game rounds to the nearest whole centimeter
			const longestSide = volume.root(3).toPrecision("1 cm");

			return {
				longest_side: longestSide.toCompound(CANONICAL_UNITS.length),
			};
		} catch (error) {
			LOGGER.debug(
				`Failed to derive \`longest_side\` from volume \`${object.volume}\`: ${extractErrorMessage(error)}`,
			);

			return undefined;
		}
	},
};

/**
 * All runtime derivations applied in order.
 */
const DERIVATIONS: RuntimeDerivation[] = [LONGEST_SIDE_FROM_VOLUME];

/**
 * Applies all matching derivations and appends a single `derive` entry when any produced properties.
 *
 * @param timeline The object's timeline, to which the `derive` entry is appended.
 * @param key The object's compound key, for logging.
 * @param object The object to derive properties for.
 *
 * @returns The object merged with any derived properties.
 */
export function derive(
	timeline: Timeline,
	key: CompoundKey,
	object: GameObject,
): GameObject {
	const patches: Patch[] = [];

	let derived = object;

	for (const derivation of DERIVATIONS) {
		if (!derivation.check(derived)) continue;

		const properties = derivation.derive(derived);

		if (!properties) continue;

		const defined = entries(properties).filter(
			(entry): entry is [string, JSONValue] => entry[1] !== undefined,
		);

		if (!defined.length) continue;

		for (const [property, value] of defined)
			patches.push({ op: "insert", path: [property], value });

		derived = { ...derived, ...fromEntries(defined) };

		LOGGER.debug(`Applied derivation \`${derivation.name}\` to ${key}`);
	}

	if (patches.length)
		appendEntry(timeline, { via: "derive" }, patches, derived);

	return derived;
}

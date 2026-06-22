/**
 * @file Strict schema for `inherit` values: a bare id string, an inherit-spec object, or a non-empty array of either.
 */

import { Type, type Static } from "typebox";

/** A resolved `inherit` value: an id, a spec object, or a non-empty list of them. */
export type InheritValue = Static<typeof ContentSchema>;

/** A structured `inherit` entry naming a parent by id, optionally narrowing scope/type. */
const InheritSpecSchema = Type.Object(
	{
		id: Type.String({ minLength: 1 }),
		type: Type.Optional(Type.String()),
		scope: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

/** One inherit entry: a bare id string or a spec object. */
const InheritEntrySchema = Type.Union([
	Type.String({ minLength: 1 }),
	InheritSpecSchema,
]);

/** Gate: a single inherit entry, or a non-empty array of entries. */
export const ContentSchema = Type.Union([
	InheritEntrySchema,
	Type.Array(InheritEntrySchema, { minItems: 1 }),
]);

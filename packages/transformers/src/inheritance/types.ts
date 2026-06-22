/**
 * @file Hand-authored inheritance types: the resolution target the engine produces from a normalized `inherit` spec.
 *
 * The `inherit` value shape and its schema live in `./schema.ts`.
 */

import type { ModID, ModScope, ObjectID, ObjectType } from "@frmds/frontier";

/** A resolved inheritance target with scope information. */
export interface ResolvedInheritTarget {
	id: ObjectID;
	type?: ObjectType;
	scope: ModScope;
	declaredScope?: ModID;
}

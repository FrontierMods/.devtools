/**
 * @file Hand-authored function domain types + the argument-reference guard.
 * Typebox schemas (incl. the validation source for these shapes) live in ./schema.ts.
 */

import type { GameObject } from "@frmds/autodoc";
import {
	isObject,
	type JSONObject,
	type JSONValue,
	type ObjectID,
} from "@frmds/frontier";
import type { JSONPrimitiveType } from "./schema.ts";

/** A single argument of a function. */
type FunctionArgument = [key: string, value: JSONPrimitiveType];
/** Function arguments as they are provided to the function object. */
type FunctionArgs = FunctionArgument[];

/**
 * Function definition object.
 */
export interface FunctionObject extends GameObject {
	type: "FUNCTION";
	id: ObjectID;
	args: FunctionArgs;
	returns: JSONValue;
}

/**
 * Function invocation object.
 */
export interface FunctionInvocation extends JSONObject {
	fn: string;
	args: JSONValue[];
}

/**
 * Argument reference for functions.
 */
export interface ArgumentReference extends JSONObject {
	arg: string;
}

/**
 * Type guard for ArgumentReference.
 */
export function isArgumentReference(
	value: unknown,
): value is ArgumentReference {
	return isObject(value) && "arg" in value && typeof value.arg === "string";
}

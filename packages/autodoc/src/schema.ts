/**
 * @file Schema validation utilities.
 * Provides human-readable error messages for schema validation failures.
 */

import { isObject, pluralize } from "@frmds/frontier";
import { type Static, type TSchema } from "typebox";
import { Compile, type Validator } from "typebox/compile";

/**
 * Validation error structure.
 */
interface ValidationError {
	/** Path to the offending value within the validated instance. */
	instancePath: string;
	/** Raw validator message describing the failure. */
	message: string;
	/** Validation keyword that triggered the failure, when reported. */
	keyword?: string;
	/** Path to the offending node within the schema, when reported. */
	schemaPath?: string;
	/** Extra parameters the validator attached to the failure. */
	params?: Record<string, unknown>;
}

/**
 * Result of a validation operation.
 */
export interface ValidationResult {
	/** Whether the value satisfied the schema. */
	success: boolean;
	/** Human-readable failure messages, present only when validation fails. */
	errors?: string[];
}

/**
 * Compiled validators by schema. Compilation is JIT-expensive, so each schema compiles once and all later checks ride the fast path.
 */
const COMPILED_VALIDATORS = new WeakMap<TSchema, Validator>();

/**
 * Returns the compiled validator for a schema, building and caching it on first use. Replaces the interpretive `Value.Check`, which re-walks the schema graph on every call, too slow for the per-node checks the scan and transform phases perform.
 *
 * @param schema The schema to compile or look up.
 *
 * @returns The cached compiled validator for the schema.
 */
export function compiledValidator(schema: TSchema): Validator {
	let validator = COMPILED_VALIDATORS.get(schema);

	if (!validator) {
		validator = Compile(schema);

		COMPILED_VALIDATORS.set(schema, validator);
	}

	return validator;
}

/**
 * Converts Typebox validation errors to human-readable messages.
 *
 * @param error Typebox validation error.
 * @param context Optional context object for better error messages.
 *
 * @returns Human-readable error message.
 */
export function formatValidationError(
	error: ValidationError,
	context?: unknown,
): string {
	const path = error.instancePath;
	const message = error.message;

	if (message.includes("must have required properties")) {
		const match = message.match(/must have required properties (.+)/);

		if (match) {
			// * we know `match[1]` is always defined because we know the message contains the prerequisite error phrase, and thus lists the missing fields after the phrase
			const missingFields = match[1]!.split(", ");
			const fields = `\`${missingFields.join("`, `")}\``;

			if (
				isObject(context) &&
				"type" in context &&
				typeof context.type === "string"
			)
				return `${context.type}: missing required ${pluralize(missingFields.length, "field")}: ${fields}`;

			return `Missing required ${pluralize(missingFields.length, "field")}: ${fields}`;
		}
	}

	if (message.includes("must be")) {
		const field = path.split("/").pop() || "value";

		if (message.includes("must be string"))
			return `\`${field}\` must be a string`;

		if (message.includes("must be number"))
			return `\`${field}\` must be a number`;

		if (message.includes("must be integer"))
			return `\`${field}\` must be an integer`;

		if (message.includes("must be boolean"))
			return `\`${field}\` must be a boolean`;

		if (message.includes("must be array"))
			return `\`${field}\` must be an array`;

		if (message.includes("must be object"))
			return `\`${field}\` must be an object`;

		if (message.includes(">=")) {
			const match = message.match(/>= (\d+)/);
			const min = match ? match[1] : "minimum";

			return `\`${field}\` must be greater than or equal to ${min}`;
		}

		if (message.includes("<=")) {
			const match = message.match(/<= (\d+)/);
			const max = match ? match[1] : "maximum";

			return `\`${field}\` must be less than or equal to ${max}`;
		}
	}

	if (message.includes("must not have fewer than")) {
		const match = message.match(/must not have fewer than (\d+) items/);

		if (match)
			return `Array must have at least ${match[1]} item${
				match[1] === "1" ? "" : "s"
			}`;
	}

	if (message.includes("must not have more than")) {
		const match = message.match(/must not have more than (\d+) items/);

		// * we know `match` exists because we know the shape of the message and have validated against it
		// * we know `match[1]` exists because if the message above matches, its structure will contain a number
		const count = Number.parseInt(match![1]!);

		if (match)
			return `Array must have at most ${count} ${pluralize(count, "item")}`;
	}

	if (message.includes("must be equal to constant")) {
		const field = path.split("/").pop();

		if (field) return `Invalid value for \`${field}\``;

		return "Invalid value";
	}

	// * return clean path if nothing matches
	return path ? `\`${path.replace(/^\//, "")}\`: ${message}` : message;
}

/**
 * Validates a value against a schema and returns human-readable errors.
 *
 * @param schema Typebox schema to validate against.
 * @param value Value to validate.
 *
 * @returns Validation result with formatted errors.
 *
 * @example
 * ```ts
 * const UserSchema = Type.Object({
 *   name: Type.String(),
 *   age: Type.Integer({ minimum: 0 })
 * });
 *
 * const result = validateWithSchema(UserSchema, { name: 123, age: -5 });
 * if (!result.success) {
 *   console.log(result.errors);
 *   // [`name` must be a string, `age` must be >= 0]
 * }
 * ```
 */
export function validateWithSchema<T extends TSchema>(
	schema: T,
	value: unknown,
): ValidationResult {
	const validator = compiledValidator(schema);
	const valid = validator.Check(value);

	if (valid) return { success: true };

	const errors = validator.Errors(value);

	return {
		success: false,
		errors: errors.map((error) => formatValidationError(error, value)),
	};
}

/**
 * Asserts that a value matches a schema, throwing with human-readable errors.
 *
 * @param schema Typebox schema to validate against.
 * @param value Value to validate.
 * @param errorPrefix Optional prefix for error message.
 *
 * @throws Error with formatted validation errors.
 *
 * @example
 * ```ts
 * const ConfigSchema = Type.Object({
 *   port: Type.Integer({ minimum: 1, maximum: 65535 })
 * });
 *
 * assertSchema(ConfigSchema, config, "Invalid configuration");
 * ```
 */
export function assertSchema<T extends TSchema>(
	schema: T,
	value: unknown,
	errorPrefix?: string,
): asserts value is Static<T> {
	const result = validateWithSchema(schema, value);

	if (!result.success) {
		const prefix = errorPrefix ? `${errorPrefix}:\n` : "";

		throw new Error(`${prefix}${result.errors?.join("\n")}`);
	}
}

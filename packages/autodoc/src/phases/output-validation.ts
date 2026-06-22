/**
 * @file Finalization diagnostic: flags a value still occupying a `strict` transformer's path that its `content` schema rejects.
 */

import { getAtPath, type JSONValue } from "@frmds/frontier";
import { validateWithSchema } from "../schema.ts";
import { expandPathPattern, matchesContent } from "./targeting.ts";
import type { GameObject, PositionalTransformer } from "../types/types.ts";

/**
 * Reports whether `value` is unchanged from `original`.
 *
 * @param value The current value being checked.
 * @param original The original value to compare against.
 *
 * @returns `true` when the two values serialize identically.
 */
function isUnchanged(
	value: JSONValue,
	original: JSONValue | undefined,
): boolean {
	return JSON.stringify(value) === JSON.stringify(original);
}

/**
 * Collects human-readable validation errors for every strict positional target whose declared path is still occupied by an untransformed value that fails its `content` schema.
 *
 * @param final The object after all transforms and rescans have settled.
 * @param raw The object's original self, used to tell transformed values from untouched ones.
 * @param strictPositional Positional transformers whose target opts into strict validation.
 *
 * @returns Human-readable validation errors for every offending strict positional target.
 */
export function validatePositionalTargets(
	final: GameObject,
	raw: GameObject,
	strictPositional: PositionalTransformer[],
): string[] {
	const errors: string[] = [];

	for (const transformer of strictPositional)
		for (const pattern of transformer.target.paths)
			for (const path of expandPathPattern(final, pattern)) {
				const value = getAtPath(final, path);

				if (value === undefined) continue;
				if (matchesContent(transformer.target.content, value)) continue;
				if (!isUnchanged(value, getAtPath(raw, path))) continue;

				const { errors: schemaErrors = [] } = validateWithSchema(
					transformer.target.content,
					value,
				);

				errors.push(
					`\`${path.join(".")}\` (transformer \`${transformer.name}\`): ${schemaErrors.join("; ")}`,
				);
			}

	return errors;
}

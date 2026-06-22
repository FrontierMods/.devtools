/**
 * @file Transformer targeting: partition by walk strategy, content-match via Typebox, expand `*` array-wildcard path patterns, and collect positional matches.
 */

import {
	getAtPath,
	isObject,
	type JSONValue,
	type PropertyPath,
} from "@frmds/frontier";
import type { TSchema } from "typebox";
import { compiledValidator } from "../schema.ts";
import type { PositionalTransformer, Transformer } from "../types/types.ts";

/**
 * A positional match.
 */
export interface PositionalMatch {
	/** The transformer whose declared path pattern produced this match. */
	transformer: Transformer;
	/** The concrete path at which the match was found. */
	path: PropertyPath;
	/** The value located at the matched path. */
	value: JSONValue;
}

/**
 * Determines whether a transformer targets declared a known set of paths.
 *
 * @param transformer The transformer to classify.
 *
 * @returns `true` when the transformer's target declares `paths`.
 */
function isPositionalTransformer(
	transformer: Transformer,
): transformer is PositionalTransformer {
	return (
		"paths" in transformer.target && transformer.target.paths !== undefined
	);
}

/**
 * Splits transformers by walk strategy.
 *
 * @param transformers All registered transformers to partition.
 *
 * @returns The transformers split into `traversal` and `positional` groups.
 */
export function partitionTransformers(transformers: Transformer[]): {
	traversal: Transformer[];
	positional: PositionalTransformer[];
} {
	const traversal: Transformer[] = [];
	const positional: PositionalTransformer[] = [];

	for (const transformer of transformers) {
		if (isPositionalTransformer(transformer)) {
			positional.push(transformer);
		} else {
			traversal.push(transformer);
		}
	}

	return { traversal, positional };
}

/**
 * Reports whether `value` satisfies a `content` schema.
 *
 * @param content The schema the value is checked against.
 * @param value The value to validate.
 *
 * @returns `true` when the value satisfies the schema.
 */
export function matchesContent(content: TSchema, value: JSONValue): boolean {
	return compiledValidator(content).Check(value);
}

/**
 * Expands a JSONPath pattern against `root` into the concrete, existing paths it matches.
 * A `*` enumerates array indices, while a literal segment descends one key or index, dropping the branch if absent.
 *
 * @param root The value the pattern is expanded against.
 * @param pattern The path pattern, with `*` segments standing for array wildcards.
 *
 * @returns The concrete, existing paths the pattern matches.
 */
export function expandPathPattern(
	root: JSONValue,
	pattern: PropertyPath,
): PropertyPath[] {
	let paths: PropertyPath[] = [[]];
	let cursors: JSONValue[] = [root];

	for (const segment of pattern) {
		const nextPaths: PropertyPath[] = [];
		const nextCursors: JSONValue[] = [];

		for (let index = 0; index < paths.length; index++) {
			const current = cursors[index]!;

			// * array wildcard component
			// * this targets all members of the array at path
			if (segment === "*") {
				if (Array.isArray(current))
					for (
						let arrayIndex = 0;
						arrayIndex < current.length;
						arrayIndex++
					) {
						nextPaths.push([
							...paths[index]!,
							arrayIndex.toString(),
						]);
						nextCursors.push(current[arrayIndex]!);
					}

				continue;
			}

			const child = Array.isArray(current)
				? current[parseInt(segment)]
				: isObject(current)
					? (current[segment] as JSONValue | undefined)
					: undefined;

			if (child !== undefined) {
				nextPaths.push([...paths[index]!, segment]);
				nextCursors.push(child);
			}
		}

		paths = nextPaths;
		cursors = nextCursors;
	}

	return paths;
}

/**
 * For each positional transformer, expands its path patterns and keeps those whose value satisfies `content`.
 *
 * @param root The object the positional patterns are expanded against.
 * @param transformers The positional transformers whose declared paths are matched.
 *
 * @returns The positional matches found across the object.
 */
export function collectPositionalMatches(
	root: JSONValue,
	transformers: PositionalTransformer[],
): PositionalMatch[] {
	const matches: PositionalMatch[] = [];

	for (const transformer of transformers)
		for (const pattern of transformer.target.paths)
			for (const path of expandPathPattern(root, pattern)) {
				const value = getAtPath(root, path);

				if (
					value !== undefined &&
					matchesContent(transformer.target.content, value)
				)
					matches.push({ transformer, path, value });
			}

	return matches;
}

/**
 * Reports whether `path` is `prefix` or sits beneath it, used to scope positional rescan.
 *
 * @param path The path being tested.
 * @param prefix The prefix the path is checked against.
 *
 * @returns `true` when `path` equals `prefix` or descends from it.
 */
export function isPathAtOrUnder(
	path: PropertyPath,
	prefix: PropertyPath,
): boolean {
	if (path.length < prefix.length) return false;

	return prefix.every((segment, index) => path[index] === segment);
}

/**
 * Reports whether one path is a prefix of the other, meaning they share a root-to-leaf line.
 *
 * A modification at one path can change whether a positional pattern at the other matches only in this case.
 *
 * @param first The first path to compare.
 * @param second The second path to compare.
 *
 * @returns `true` when either path is a prefix of the other.
 */
export function pathsComparable(
	first: PropertyPath,
	second: PropertyPath,
): boolean {
	return isPathAtOrUnder(first, second) || isPathAtOrUnder(second, first);
}

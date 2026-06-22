/**
 * @file Type-only fixed-length string validation.
 *
 * `FixedLength` collapses a wrong-length literal to `never`, gating assignment.
 * It inspects string *literal* types only: a widened runtime `string` is never validated here.
 */

/**
 * Counts characters of a string literal by peeling one char per recursion.
 */
export type Length<
	Text extends string,
	Counter extends unknown[] = [],
> = Text extends `${string}${infer Rest}`
	? Length<Rest, [...Counter, unknown]>
	: Counter["length"];

/**
 * Resolves to `Text` when it is exactly `N` chars long, otherwise `never`.
 */
export type FixedLength<Text extends string, N extends number> =
	Length<Text> extends N ? Text : never;

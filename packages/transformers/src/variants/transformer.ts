/**
 * @file The `variants` transformer: expands a `variants` template carrying a `from` array into one variant per entry.
 *
 * @example
 * ```json5
 * // input: a bare `id` is weight 1 + an `[id, weight]` tuple sets the weight
 * {
 *   variants: [
 *     { from: ["multicam", ["black", 2]], description: "Low-profile plate carrier" },
 *   ],
 * }
 *
 * // output: variant `multicam` (weight 1) and `black` (weight 2),
 * //   each with a `<variant:id>` description suffix
 * ```
 */

import type { JSONObject, Patch } from "@frmds/frontier";
import type { Transformer } from "@frmds/autodoc";
import { Type } from "typebox";

/** Identifier of a single variant. */
type VariantID = string;

/** A variant paired with its spawn weight. */
type VariantTuple = [id: VariantID, weight: number];

/** A `from` entry: a bare id (weight 1) or an `[id, weight]` tuple. */
type VariantEntry = VariantID | VariantTuple;

/** The template variant whose `from` array drives expansion. */
interface TemplateVariant extends JSONObject {
	name: string;
	description: string;
	from: VariantEntry[];
	plural?: boolean;
}

/** A variant entry whose `from` array drives expansion. Sibling entries already expanded (plain `id`/`weight`, no `from`) fall outside the gate and are left untouched, so the target is not `strict`. */
const ContentSchema = Type.Object(
	{
		from: Type.Array(
			Type.Union([
				Type.String(),
				Type.Tuple([Type.String(), Type.Number()]),
			]),
			{ minItems: 1 },
		),
	},
	{ additionalProperties: true },
);

/** The `variants` transformer: a `from`-bearing template → its expanded sibling variants. */
const VARIANTS_TRANSFORMER: Transformer<TemplateVariant> = {
	name: "expandVariants",
	version: "3.0.0",
	api: "1.0.0",
	description: "Expands variants from 'from' arrays",
	target: { paths: [["variants", "*"]], content: ContentSchema },

	transform(variant): Patch[] {
		const { from, plural, ...template } = variant;
		const suffix = plural ? "/plural" : "";

		const variants = from.map((entry) => {
			const [id, weight] = Array.isArray(entry) ? entry : [entry, 1];

			return {
				...template,
				id,
				weight,
				expand_snippets: true,
				description: `${template.description}  <variant:${id}${suffix}>`,
			};
		});

		// * insert each expanded variant after the template's position in the array
		const patches: Patch[] = Array.from(
			{ length: variants.length },
			(_, index) => ({
				op: "insert",
				path: ["..", (index + 1).toString()],
				value: variants[index]!,
			}),
		);

		// * remove the template variant at the current position
		patches.push({ op: "remove", path: [] });

		return patches;
	},
};

export default VARIANTS_TRANSFORMER;

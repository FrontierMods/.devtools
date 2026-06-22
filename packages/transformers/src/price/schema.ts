/**
 * @file Strict schema and accepted-value constants for the price transformer's `price_postapoc` index.
 *
 * The label list is the single source of truth: the score type and runtime schema both derive from it.
 */

import { Type } from "typebox";

/** Qualitative score label accepted for an index field. */
export type ScoreLabel = (typeof SCORE_LABELS)[number];

/** An index field value: a 0–3 score, or its qualitative label. */
export type ScoreInput = number | ScoreLabel;

/** Qualitative score labels, ordered none→high (0→3). */
export const SCORE_LABELS = ["none", "low", "medium", "high"] as const;

/** A single index score: an integer 0–3 (the four discrete levels), or one of the labels. */
export const ScoreSchema = Type.Union([
	Type.Integer({ minimum: 0, maximum: 3 }),
	...SCORE_LABELS.map((label) => Type.Literal(label)),
]);

/** Gate: a barter price index. */
export const ContentSchema = Type.Object(
	{
		utility: ScoreSchema,
		longevity: ScoreSchema,
		scarcity: ScoreSchema,
	},
	{ additionalProperties: false },
);

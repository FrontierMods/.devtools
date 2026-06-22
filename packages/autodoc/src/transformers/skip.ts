/**
 * @file The signal a transformer raises to skip when its input does not yet satisfy its schema.
 */

/**
 * Thrown by a transformer when its input is not yet in the expected shape, signalling the execute phase to skip this application instead of failing. The `message` should explain what was expected and why it was not met.
 */
export class TransformerSkip extends Error {
	readonly name = "TransformerSkip";
}

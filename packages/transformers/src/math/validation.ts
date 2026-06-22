/**
 * @file Numeric/unit validation helpers for the math engine.
 */

/**
 * Validates that a percentage value is between 0 and 1.
 * @throws {Error} If value is not a valid percentage
 */
export function validatePercentage(
	value: number,
	parameterName = "percentage",
): asserts value is number {
	if (value < 0 || value > 1)
		throw new Error(
			`Invalid \`${parameterName}\`: \`${value}\`. Must be a number between 0 and 1.`,
		);
}

/**
 * Validates that a unit is a non-empty string.
 * @throws {Error} If value is not a valid unit string
 */
export function validateUnit(value: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "")
		throw new Error(
			`Invalid target unit: \`${value}\`. Must be a non-empty string.`,
		);
}

/**
 * Parses a string to a finite number.
 * @throws {Error} If value cannot be parsed to a finite number
 */
export function parseNumericString(value: string): number {
	const trimmed = value.trim();
	const number = Number(trimmed);

	if (!Number.isFinite(number))
		throw new Error(`Invalid numeric value: ${value}`);

	return number;
}

/**
 * Validates that a numeric result is finite.
 *
 * @throws {Error} If result is not a finite number
 */
export function assertFiniteResult(result: number, operation: string): void {
	if (!Number.isFinite(result))
		throw new Error(
			`Operation "${operation}" resulted in non-finite value: ${result}`,
		);
}

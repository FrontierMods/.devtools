/**
 * @file Reading and parsing of mod source files: format inference, per-format parsers, and single and batch readers.
 */

import fs from "fs-extra";
import { JSON5 } from "bun";
import path from "path";
import type { CanonicalPath, InputFormat } from "../types/data.ts";

/**
 * Parses a raw file string into an unstructured value, dispatched by input format.
 */
type Parser = (raw: string) => unknown;

/**
 * Options for reading and parsing files.
 */
export interface ReadOptions {
	/** Input format. Default: infer from extension */
	format?: InputFormat;
}

/**
 * Result of reading and parsing a single file.
 */
export interface ReadResult<T> {
	/** Original source file path */
	sourcePath: CanonicalPath;
	/** Parsed data */
	data: T;
}

/**
 * Parsers keyed by input format.
 */
const PARSERS: Record<InputFormat, Parser> = {
	json: JSON.parse,
	json5: JSON5.parse,
};

/**
 * Map from file extension (without dot) to input format.
 */
const EXTENSION_FORMAT: Record<string, InputFormat> = {
	json: "json",
	json5: "json5",
};

/**
 * Infers the input format from a file extension.
 * Falls back to JSON if the extension is unrecognized.
 *
 * @param filePath Path whose extension determines the format.
 *
 * @returns Input format inferred from the extension, defaulting to JSON
 */
function inferFormat(filePath: string): InputFormat {
	const extension = path.extname(filePath).slice(1).toLowerCase();

	return EXTENSION_FORMAT[extension] ?? "json";
}

/**
 * Reads and parses a single file.
 *
 * @param filePath Canonical path to the file.
 * @param options Read options (format override).
 *
 * @returns Parsed result with source path metadata
 *
 * @throws When the file contents fail to parse under the resolved format.
 *
 * @example
 * ```typescript
 * const result = await readFile<GameObject[]>(sourcePath);
 * // result.data is the parsed array, result.sourcePath is the original path
 * ```
 */
export async function readFile<T>(
	filePath: CanonicalPath,
	options?: ReadOptions,
): Promise<ReadResult<T>> {
	const format = options?.format ?? inferFormat(filePath);
	const parse = PARSERS[format];

	const raw = await fs.readFile(filePath, "utf8");

	return {
		sourcePath: filePath,
		data: parse(raw) as T,
	};
}

/**
 * Reads and parses multiple files in parallel.
 *
 * @param paths Array of canonical file paths.
 * @param options Read options (format override).
 *
 * @returns Array of parsed results, one per input file
 *
 * @throws When any file's contents fail to parse under the resolved format.
 *
 * @example
 * ```typescript
 * const results = await readFiles<GameObject[]>(sources, { format: "json5" });
 * ```
 */
export async function readFiles<T>(
	paths: CanonicalPath[],
	options?: ReadOptions,
): Promise<ReadResult<T>[]> {
	return Promise.all(paths.map((filePath) => readFile<T>(filePath, options)));
}

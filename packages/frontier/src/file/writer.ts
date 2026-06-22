/**
 * @file Serialization and writing of output files: output-path derivation, per-format serializers, and the parallel writer.
 */

import fs from "fs-extra";
import path from "path";
import type { CanonicalPath, OutputFormat } from "../types/data.ts";
import { normalizePath } from "./paths.ts";

/**
 * Serializes a value to a string for one output format, optionally honoring an indent.
 */
type Serializer = (value: unknown, indent?: number) => string;

/**
 * Options for serializing and writing files.
 */
export interface WriteOptions {
	/** Root directory of input files (for relative path calculation) */
	inputRoot: CanonicalPath;
	/** Output directory */
	outputDir: CanonicalPath;
	/** Output format. Default: "json" */
	format?: OutputFormat;
	/** JSON indentation. Default: 2 */
	indent?: number;
}

/**
 * A single item to serialize and write.
 */
export interface WriteItem<T> {
	/** Original source path (used to calculate output path) */
	sourcePath: CanonicalPath;
	/** Data to serialize and write */
	data: T;
}

/**
 * Result of writing a single file.
 */
export interface WriteResult {
	/** Original source path the output derives from. */
	sourcePath: CanonicalPath;
	/** Path where file was written */
	outputPath: CanonicalPath;
}

/**
 * Serializers keyed by output format.
 */
const SERIALIZERS: Record<OutputFormat, Serializer> = {
	json: (value, indent = 2) => JSON.stringify(value, null, indent) + "\n",
};

/**
 * Builds the output path for a source file.
 *
 * Converts the source path's extension to `.json` and rebases from `inputRoot` to `outputDir`.
 *
 * @param sourcePath Canonical path of the source file.
 * @param inputRoot Root directory the source path is made relative to.
 * @param outputDir Directory the rebased output path is placed under.
 *
 * @returns Canonical output path with a `.json` extension under `outputDir`
 */
function buildOutputPath(
	sourcePath: CanonicalPath,
	inputRoot: CanonicalPath,
	outputDir: CanonicalPath,
): CanonicalPath {
	const relativeSource = path.relative(inputRoot, sourcePath);
	const directoryPart = path.dirname(relativeSource);
	const baseName = path.basename(sourcePath, path.extname(sourcePath));

	const relativeOutput =
		directoryPart === "."
			? `${baseName}.json`
			: path.join(directoryPart, `${baseName}.json`);

	return normalizePath(path.join(outputDir, relativeOutput));
}

/**
 * Serializes and writes files to the output directory.
 *
 * - Calculates output paths based on source paths relative to `inputRoot`
 * - Converts extensions (e.g., `.json5` → `.json`)
 * - Pre-creates directories for parallel write safety
 * - Skips items whose `data` is an empty array (invalid for game runtime)
 *
 * @param items Items to serialize and write.
 * @param options Write configuration.
 *
 * @returns Array of results for files that were actually written
 *
 * @example
 * ```typescript
 * const results = await writeFiles(items, {
 *     inputRoot: inputDir,
 *     outputDir,
 * });
 * ```
 */
export async function writeFiles<T>(
	items: WriteItem<T>[],
	options: WriteOptions,
): Promise<WriteResult[]> {
	const { inputRoot, outputDir, format = "json", indent } = options;
	const serialize = SERIALIZERS[format];

	// build output file descriptors, skipping empty arrays
	const outputs: {
		sourcePath: CanonicalPath;
		outputPath: CanonicalPath;
		contents: string;
	}[] = [];

	for (const item of items) {
		if (Array.isArray(item.data) && !item.data.length) continue;

		const outputPath = buildOutputPath(
			item.sourcePath,
			inputRoot,
			outputDir,
		);

		const contents = serialize(item.data, indent);

		outputs.push({ sourcePath: item.sourcePath, outputPath, contents });
	}

	// pre-create all unique directories to avoid race conditions in parallel writes
	const uniqueDirectories = new Set(
		outputs.map((file) => path.dirname(file.outputPath)),
	);

	await Promise.all(
		Array.from(uniqueDirectories).map((directory) =>
			fs.ensureDir(directory),
		),
	);

	// write all files in parallel
	const results: WriteResult[] = await Promise.all(
		outputs.map(async ({ sourcePath, outputPath, contents }) => {
			await fs.writeFile(outputPath, contents, "utf8");

			return { sourcePath, outputPath };
		}),
	);

	return results;
}

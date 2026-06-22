/**
 * @file Output-file generation from the workspace projections.
 */

import {
	type CanonicalPath,
	type GameObject,
	type ModID,
	type ModWorkspace,
	type WriteItem,
	type WriteResult,
	pluralize,
	writeFiles,
} from "@frmds/frontier";
import fs from "fs-extra";
import { EXCLUDED_OBJECT_TYPES } from "../../constants.ts";
import { AUTODOC_LOGGER } from "../../logger.ts";

/**
 * Options controlling which sources {@link generateOutputFiles} writes.
 */
export interface GenerateOutputFilesOptions {
	/** Write only these sources' projections; omit to write everything (full build). */
	onlySources?: Set<CanonicalPath>;
	/** Previously-recorded outputs whose sources no longer exist; deleted before writing. */
	deleteOutputs?: CanonicalPath[];
}

/**
 * Outcome of a {@link generateOutputFiles generateOutputFiles()} run.
 */
export interface GenerateOutputFilesResult {
	/** Count of files written. */
	filesWritten: number;
	/** Per-file write results. */
	written: WriteResult[];
}

/**
 * Child logger scoped to output generation.
 */
const logger = AUTODOC_LOGGER.getChild("output");

/**
 * Generates output files from the workspace's file documents.
 *
 * @param workspace The workspace holding live projections to write.
 * @param modId The mod whose files are written.
 * @param inputDir The input root used to derive relative output paths.
 * @param outputDir The directory output files are written into.
 * @param options Controls which sources are written and which stale outputs are deleted.
 *
 * @returns The count of files written and their per-file write results.
 */
export async function generateOutputFiles(
	workspace: ModWorkspace,
	modId: ModID,
	inputDir: CanonicalPath,
	outputDir: CanonicalPath,
	options: GenerateOutputFilesOptions = {},
): Promise<GenerateOutputFilesResult> {
	logger.debug(`Generating output files...`);

	for (const stalePath of options.deleteOutputs ?? [])
		await fs.remove(stalePath);

	const items: WriteItem<GameObject[]>[] = [];

	for (const sourcePath of workspace.files(modId)) {
		if (options.onlySources && !options.onlySources.has(sourcePath))
			continue;

		const objects = workspace.liveProjection(modId, sourcePath);

		items.push({
			sourcePath,
			data: objects.filter(
				({ type }) => !EXCLUDED_OBJECT_TYPES.includes(type),
			),
		});
	}

	const results = await writeFiles(items, { inputRoot: inputDir, outputDir });

	logger.debug(
		`Wrote ${results.length} ${pluralize(results.length, "file")} to \`${outputDir}\`${options.deleteOutputs?.length ? `, removed ${options.deleteOutputs.length} stale` : ""}`,
	);

	return { filesWritten: results.length, written: results };
}

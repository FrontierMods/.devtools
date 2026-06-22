/**
 * @file Listr task pipeline assembling the build stages.
 */

import { pluralize } from "@frmds/frontier";
import type { LoggerFieldFn } from "listr2";
import { Listr } from "listr2";
import { config } from "../../context.ts";
import { executePhase } from "../../phases/execute.ts";
import { createRecordingView } from "../../object/recording-view.ts";
import { createObjectsView } from "../../object/store-view.ts";
import { resolveTransformerSet } from "../../transformers/@loader.ts";
import type { BuildFlags } from "./index.ts";
import { generateOutputFiles } from "./output.ts";
import { evaluateObjects } from "./processing.ts";
import {
	analyzeDependencies,
	checkBuildFreshness,
	cleanCaches,
	computeDirtyStage,
	loadModFiles,
	recordBuildManifest,
	setupBuildContext,
} from "./stages.ts";
import { type BuildTaskContext, assertState } from "./state.ts";

/**
 * Minimum gap between progress title repaints, capping renderer work at ~10 updates per second.
 */
const TITLE_UPDATE_INTERVAL_MS = 100;

/**
 * High-precision duration formatter for the progress renderer.
 */
const PRECISE_TIMER: LoggerFieldFn<[number]> = {
	condition: true,
	field: formatDuration,
	format: () => formatMessage,
};

/**
 * Formats a duration as a millisecond string for the progress renderer.
 * Custom high-precision timer formatter for listr2.
 * Shows milliseconds with full precision for all durations.
 *
 * @param duration The duration in milliseconds.
 *
 * @returns The duration rendered as a millisecond string.
 */
function formatDuration(duration: number): string {
	return `${duration.toFixed(0)}ms`;
}

/**
 * Dims a message with ANSI styling for progress output.
 *
 * @param message The message to dim, defaulting to an empty string when omitted.
 *
 * @returns The message wrapped in ANSI dim styling.
 */
function formatMessage(message?: string): string {
	return `\x1b[2m${message ?? ""}\x1b[22m`;
}

/**
 * Assembles the ordered task list that runs a full build.
 *
 * @param flags Parsed flags controlling cleaning, paths, and concurrency.
 *
 * @returns The configured task runner.
 */
export function createBuildTasks(flags: BuildFlags): Listr<BuildTaskContext> {
	return new Listr<BuildTaskContext>(
		[
			{
				title: "Cleaning caches",
				skip: () => !flags.clean,
				task: async (_, task) => {
					const result = await cleanCaches(config.paths.output);

					const cleared = [
						result.outputDirCleared && "output",
						result.modCacheCleared && "mod cache",
					].filter(Boolean);

					task.title = `Cleaning caches (${cleared.join(", ")})`;
				},
			},

			{
				title: "Setting up build",
				task: async (ctx, task) => {
					const result = await setupBuildContext();

					Object.assign(ctx, result);

					task.title = `Setting up build (${result.sources.length} source ${pluralize(result.sources.length, "file")})`;
				},
			},

			{
				title: "Loading transformers",
				task: async (ctx, task) => {
					ctx.transformers = await resolveTransformerSet(config);

					task.title = `Loading transformers (${ctx.transformers.length})`;
				},
			},

			{
				title: "Checking freshness",
				task: async (ctx, task) => {
					assertState(
						ctx,
						task.title,
						"sources",
						"transformers",
						"modId",
					);

					ctx.freshness = await checkBuildFreshness(
						ctx.sources,
						ctx.transformers,
						ctx.modId,
					);

					task.title = ctx.freshness.upToDate
						? "Checking freshness (up to date)"
						: `Checking freshness (${ctx.freshness.reason})`;
				},
			},

			{
				title: "Loading files",
				skip: (ctx) => ctx.freshness?.upToDate === true,
				task: async (ctx, task) => {
					assertState(
						ctx,
						task.title,
						"workspace",
						"sources",
						"modId",
					);

					const result = await loadModFiles(
						ctx.workspace,
						ctx.sources,
						ctx.modId,
						ctx.freshness?.dependencyFingerprints,
					);

					Object.assign(ctx, result);

					task.title = `Loading files (${result.filesLoaded} ${pluralize(result.filesLoaded, "file")}, ${result.objectsLoaded} ${pluralize(result.objectsLoaded, "object")})`;
				},
			},

			{
				title: "Computing dirty set",
				skip: (ctx) => ctx.freshness?.upToDate === true,
				task: async (ctx, task) => {
					assertState(
						ctx,
						task.title,
						"freshness",
						"fileContexts",
						"transformers",
					);

					ctx.dirtyStage = await computeDirtyStage(
						ctx.freshness,
						ctx.fileContexts,
						ctx.transformers,
					);

					const total = ctx.fileContexts.length;

					task.title = `Computing dirty set (${ctx.dirtyStage.dirty.size}/${total} dirty, ${total - ctx.dirtyStage.dirty.size} cached)`;
				},
			},

			{
				title: "Analyzing dependencies",
				skip: (ctx) => ctx.freshness?.upToDate === true,
				task: async (ctx, task) => {
					assertState(ctx, task.title, "fileContexts", "dirtyStage");

					const dirtyContexts = ctx.fileContexts.filter(
						({ sourcePath }) =>
							ctx.dirtyStage!.dirty.has(sourcePath),
					);

					const result = analyzeDependencies(dirtyContexts);

					ctx.processingOrder = result.processingOrder;

					task.title = `Analyzing dependencies (${result.objectCount} ${pluralize(result.objectCount, "object")})`;
				},
			},
			{
				title: "Evaluating objects",
				skip: (ctx) => ctx.freshness?.upToDate === true,
				task: async (ctx, task) => {
					assertState(
						ctx,
						task.title,
						"processingOrder",
						"transformers",
					);

					const result = await evaluateObjects(
						ctx.processingOrder,
						ctx.transformers,
					);

					ctx.sortResults = result.sortResults;
					ctx.objectContexts = result.objectContexts;
					ctx.transformers = result.transformers;
					ctx.objectDependencies = result.objectDependencies;

					task.title = `Evaluating objects (${result.evaluatedCount} ${pluralize(result.evaluatedCount, "object")})`;
				},
			},
			{
				title: "Transforming objects",
				skip: (ctx) => ctx.freshness?.upToDate === true,
				task: async (ctx, task) => {
					assertState(
						ctx,
						task.title,
						"workspace",
						"scope",
						"sortResults",
						"objectContexts",
						"transformers",
						"modId",
					);

					const recording = createRecordingView(
						createObjectsView(ctx.workspace, ctx.scope),
					);

					const baseContext = {
						workspace: ctx.workspace,
						objects: recording.view,
						scope: ctx.scope,
						// eslint-disable-next-line typescript/unbound-method -- closure from the recording-view factory, never bound to `this`
						setReadConsumer: recording.setConsumer,
					};

					// * the title setter re-renders synchronously; unthrottled per-object updates dominate the stage's wall time on slower terminals
					let lastTitleUpdate = 0;

					const executeResults = await executePhase(
						ctx.sortResults,
						ctx.objectContexts,
						baseContext,
						ctx.transformers,
						(current, total) => {
							const now = performance.now();

							if (
								current !== total &&
								now - lastTitleUpdate < TITLE_UPDATE_INTERVAL_MS
							)
								return;

							lastTitleUpdate = now;
							task.title = `Transforming objects (${current}/${total})`;
						},
					);

					ctx.processedCount = executeResults.processedCount;
					ctx.readsByFile = recording.readsByFile();
				},
			},

			{
				title: "Writing output files",
				skip: (ctx) => ctx.freshness?.upToDate === true,
				task: async (ctx, task) => {
					assertState(
						ctx,
						task.title,
						"workspace",
						"modId",
						"inputDir",
						"outputDir",
						"dirtyStage",
					);

					const result = await generateOutputFiles(
						ctx.workspace,
						ctx.modId,
						ctx.inputDir,
						ctx.outputDir,
						{
							onlySources: ctx.dirtyStage.dirty,
							deleteOutputs: ctx.dirtyStage.staleOutputs,
						},
					);

					ctx.filesWritten = result.filesWritten;
					ctx.written = result.written;

					task.title = `Writing output files (${result.filesWritten} ${pluralize(result.filesWritten, "file")})`;
				},
			},

			{
				title: "Recording manifest",
				skip: (ctx) => ctx.freshness?.upToDate === true,
				task: async (ctx, task) => {
					assertState(
						ctx,
						task.title,
						"freshness",
						"dirtyStage",
						"readsByFile",
						"objectDependencies",
						"objectContexts",
						"written",
					);

					await recordBuildManifest({
						freshness: ctx.freshness,
						dirty: ctx.dirtyStage.dirty,
						resolveOwners: ctx.dirtyStage.resolveOwners,
						readsByFile: ctx.readsByFile,
						objectDependencies: ctx.objectDependencies,
						objectContexts: ctx.objectContexts,
						written: ctx.written,
					});

					task.title = `Recording manifest (${ctx.freshness.sourceStats.size} ${pluralize(ctx.freshness.sourceStats.size, "source")})`;
				},
			},
		],
		{
			// * on `--verbose`, let the complex log replace this TUI
			silentRendererCondition: () => flags.verbose === true,
			rendererOptions: {
				collapseSubtasks: false,
				suffixRetries: true,
				timer: PRECISE_TIMER,
			},
		},
	);
}

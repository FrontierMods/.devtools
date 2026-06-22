/**
 * @file Accumulated build state and the assertion guarding required fields.
 */

import type {
	Cache,
	CanonicalPath,
	CompoundKey,
	ModID,
	ModScope,
	ModWorkspace,
	WriteResult,
} from "@frmds/frontier";
import type { SortResults } from "../../phases/types.ts";
import type { ReadLog } from "../../object/recording-view.ts";
import type {
	FileContext,
	ObjectContext,
	ProcessingItem,
	Transformer,
} from "../../types/types.ts";
import type { DirtyStageResult, FreshnessStageResult } from "./stages.ts";

/**
 * Partial {@link BuildState} that tasks read and populate across stages.
 */
export type BuildTaskContext = Partial<BuildState>;

/**
 * Complete build state accumulated across pipeline stages.
 * Each stage populates its subset of fields. {@link BuildTaskContext} is the partial view tasks operate on.
 */
export interface BuildState {
	/** The workspace files are loaded into. */
	workspace: ModWorkspace;
	/** The current mod being built. */
	modId: ModID;
	/** The current mod's dependency scope. */
	scope: ModScope;
	/** The resolved input directory. */
	inputDir: CanonicalPath;
	/** The resolved output directory. */
	outputDir: CanonicalPath;
	/** The discovered source files. */
	sources: CanonicalPath[];
	/** Per-file contexts produced while loading. */
	fileContexts: FileContext[];
	/** Count of files loaded from the current mod. */
	filesLoaded: number;
	/** Count of objects loaded from the current mod. */
	objectsLoaded: number;
	/** The flattened objects in processing order. */
	processingOrder: ProcessingItem[];
	/** Source path and mod for each processed object. */
	objectContexts: Map<CompoundKey, ObjectContext>;
	/** The transformers applied during the build. */
	transformers: Transformer[];
	/** The sorted execution targets per object. */
	sortResults: SortResults;
	/** Count of objects processed by the transform phase. */
	processedCount: number;
	/** Count of output files written. */
	filesWritten: number;
	/** The freshness verdict for the current build. */
	freshness: FreshnessStageResult;
	/** The dirty and removed sources for the current build. */
	dirtyStage: DirtyStageResult;
	/** Runtime reads from the recording view, keyed by consumer source files. */
	readsByFile: Map<CanonicalPath, ReadLog>;
	/** Scan-phase dependencies keyed by object. */
	objectDependencies: Map<CompoundKey, Set<CompoundKey>>;
	/** Source-to-output pairs actually written this run. */
	written: WriteResult[];
	/** Dependency caches kept open by lazy sources, which the build closes after the run. */
	openCaches: Cache[];
}

/**
 * Asserts that specific fields are defined on the build context.
 * Narrows the context type so downstream code can access those fields without optional chaining.
 *
 * @param context The build context to check.
 * @param stage The stage name reported in the error when a field is missing.
 * @param fields The fields required to be defined on the context.
 *
 * @throws When any required field is undefined on the context.
 */
export function assertState<K extends keyof BuildState>(
	context: BuildTaskContext,
	stage: string,
	...fields: K[]
): asserts context is BuildTaskContext & { [Field in K]: BuildState[Field] } {
	for (const field of fields) {
		if (context[field] === undefined)
			throw new Error(
				`Build stage \`${stage}\` requires \`${field}\`, but it was not set.`,
			);
	}
}

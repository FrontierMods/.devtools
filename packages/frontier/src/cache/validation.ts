/**
 * @file Cache validation and file change detection.
 *
 * Uses fast file metadata (mtime + size) to detect changes without reading file contents.
 */

import fs from "fs-extra";
import type { ModID } from "../mod/types.ts";
import type { CanonicalPath } from "../types/data.ts";
import { entries } from "../object/access.ts";

/**
 * File metadata for change detection.
 * Uses modification time and size for fast comparison without reading file contents.
 */
export interface FileMetadata {
	/** File modification time in milliseconds (from fs.stat().mtimeMs). */
	mtime: number;
	/** File size in bytes. */
	size: number;
}

/**
 * Cache metadata stored in LMDB's __meta__ namespace.
 */
export interface CacheMetadata {
	/** Frontier toolkit version that created this cache. */
	version: string;

	/** Game version (for base game cache only). */
	gameVersion?: string;

	/** Mod identifier. */
	modId: string;

	/** Mod version from modinfo.json (optional). */
	modVersion?: string;

	/** Dependency mod information (for mod caches only, excludes 'dda'). */
	dependencies?: Record<
		string,
		{
			version?: string;
		}
	>;

	/** Cache creation timestamp. */
	createdAt: number;

	/** Last access timestamp. */
	lastUsedAt: number;

	/** Tracked files with their metadata for change detection. */
	files: Record<string, FileMetadata>;
}

/**
 * Result of checking whether files exist.
 */
export interface FilesExistResult {
	/** True if all files exist. */
	exists: boolean;
	/** Paths of files that don't exist. */
	missing: CanonicalPath[];
}

/**
 * Result of validating cache metadata.
 */
export interface CacheValidationResult {
	/** True if cache is valid. */
	valid: boolean;
	/** Reason for invalidity, if applicable. */
	reason?: string;
}

/**
 * Gets file metadata for change detection.
 *
 * @param filePath Canonical path to file.
 *
 * @returns File metadata (mtime + size).
 *
 * @throws Error if file doesn't exist or can't be accessed.
 */
export async function getFileMetadata(
	filePath: CanonicalPath,
): Promise<FileMetadata> {
	const stats = await fs.stat(filePath);
	const { mtimeMs, size } = stats;

	return {
		mtime: mtimeMs,
		size,
	};
}

/**
 * Checks whether a file has changed compared to cached metadata.
 *
 * Uses fast file metadata (mtime + size) comparison without reading file contents.
 *
 * @param filePath Canonical path to file.
 * @param cachedMetadata Previously cached file metadata.
 *
 * @returns true if file has changed, false if unchanged.
 *
 * @throws Error if file doesn't exist.
 */
export async function hasFileChanged(
	filePath: CanonicalPath,
	cachedMetadata: FileMetadata,
): Promise<boolean> {
	const current = await getFileMetadata(filePath);

	return (
		current.mtime !== cachedMetadata.mtime ||
		current.size !== cachedMetadata.size
	);
}

/**
 * Detects which files have changed from a list of tracked files.
 *
 * @param trackedFiles Map of file paths to their cached metadata.
 *
 * @returns Array of file paths that have changed.
 */
export async function detectChangedFiles(
	trackedFiles: Record<string, FileMetadata>,
): Promise<CanonicalPath[]> {
	const files: CanonicalPath[] = [];

	for (const [path, meta] of entries(trackedFiles)) {
		try {
			const changed = await hasFileChanged(path, meta);

			if (changed) files.push(path);
		} catch {
			// * file no longer exists or can't be accessed
			// * treat as changed
			files.push(path);
		}
	}

	return files;
}

/**
 * Checks whether all files exist.
 *
 * @param filePaths Array of file paths to check.
 *
 * @returns Object with exists boolean and array of missing file paths.
 */
export async function checkFilesExist(
	filePaths: CanonicalPath[],
): Promise<FilesExistResult> {
	const missing: CanonicalPath[] = [];

	for (const filePath of filePaths) {
		const exists = await fs.pathExists(filePath);

		if (!exists) missing.push(filePath);
	}

	const exists = !missing.length;

	return {
		exists,
		missing,
	};
}

/**
 * Validates cache metadata against the current environment.
 *
 * @param metadata Cache metadata to validate.
 * @param toolkitVersion Expected toolkit version.
 * @param gameVersion Expected game version (for base game cache).
 * @param modId Expected mod ID.
 *
 * @returns Validation result with boolean and optional error message.
 */
export function validateCacheMetadata(
	metadata: CacheMetadata,
	toolkitVersion: string,
	gameVersion: string | undefined,
	modId: ModID,
): CacheValidationResult {
	if (metadata.version !== toolkitVersion)
		return {
			valid: false,
			reason: `Toolkit version mismatch: cache uses ${metadata.version}, current is ${toolkitVersion}`,
		};

	if (gameVersion !== undefined && metadata.gameVersion !== gameVersion)
		return {
			valid: false,
			reason: `Game version mismatch: cache uses ${metadata.gameVersion}, current is ${gameVersion}`,
		};

	if (metadata.modId !== modId)
		return {
			valid: false,
			reason: `Mod ID mismatch: cache uses ${metadata.modId}, current is ${modId}`,
		};

	return { valid: true };
}

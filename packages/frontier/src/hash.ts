/**
 * @file `xxhash`-based hashing of files and strings for compact fingerprints.
 */

import fs from "fs-extra";
import xxhash from "xxhash-wasm";
import type { CanonicalPath, Hash } from "./types/data.ts";

/**
 * The shared xxhash64 instance, initialized once at module load.
 */
const HASHER = await xxhash();

/**
 * Hashes a file's contents with {@link xxhash}.
 * Reads the whole file into memory before hashing.
 *
 * @param path The file to hash.
 *
 * @returns The hex-encoded 64-bit hash.
 *
 * @throws When the file at `path` cannot be read.
 */
export async function hashFile(path: CanonicalPath): Promise<Hash> {
	const buffer = await fs.readFile(path);

	return HASHER.h64Raw(new Uint8Array(buffer)).toString(16);
}

/**
 * Hashes an arbitrary string with {@link xxhash}.
 * Used for compact fingerprints of computed values (e.g. aggregated file metadata) where no file exists to hash.
 *
 * @param value The string to hash.
 *
 * @returns The hex-encoded 64-bit hash.
 */
export function hashString(value: string): Hash {
	return HASHER.h64ToString(value);
}

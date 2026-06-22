/**
 * @file Enumerate the JSON files a format run should touch.
 */

import {
	type CanonicalPath,
	discoverFiles,
	toCanonicalPath,
} from "@frmds/frontier";
import { statSync } from "fs";

/**
 * Resolves a target into the `.json` files to format.
 *
 * @param target The file or directory to enumerate `.json` files from.
 */
export async function discoverTargets(
	target: string,
): Promise<CanonicalPath[]> {
	const canonical = toCanonicalPath(target);

	if (statSync(canonical).isFile())
		return canonical.endsWith(".json") ? [canonical] : [];

	return discoverFiles(canonical, { patterns: ["**/*.json"] });
}

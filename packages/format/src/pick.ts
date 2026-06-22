/**
 * @file Interactive picker for choosing among multiple game installs.
 */

import { isCancel, select } from "@clack/prompts";
import {
	type CanonicalPath,
	type GameInstall,
	versionLabel,
} from "@frmds/frontier";

/**
 * Prompts the user to choose one install.
 *
 * @param installs The registered installs to choose among.
 */
export async function pickInstall(
	installs: GameInstall[],
): Promise<CanonicalPath> {
	const chosen = await select({
		message:
			"Multiple locations found for Cataclysm: Dark Days Ahead, pick one",
		options: installs.map((install) => ({
			value: install.path,
			label: install.path,
			hint: versionLabel(install.sha),
		})),
	});

	if (isCancel(chosen)) throw new Error("Install selection cancelled");

	return chosen;
}

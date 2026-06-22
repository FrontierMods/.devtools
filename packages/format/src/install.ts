/**
 * @file Resolve which game install a format run should use.
 */

import {
	type CanonicalPath,
	type GameInstall,
	listInstalls,
	resolveGamePath,
} from "@frmds/frontier";
import type { FormatFlags } from "./command.ts";
import { pickInstall } from "./pick.ts";

/**
 * Injectable collaborators, so resolution is testable without a real TTY or config.
 */
export interface ResolveTargetDeps {
	/** List registered installs. Defaults to the global config's installs. */
	list?: () => GameInstall[];
	/** Pick one install interactively. Defaults to the clack picker. */
	pick?: (installs: GameInstall[]) => Promise<CanonicalPath>;
	/** Whether stdin is interactive. Defaults to `process.stdin.isTTY`. */
	isTTY?: boolean;
}

/**
 * Resolves the install to format against.
 *
 * @param flags Command flags.
 * @param deps Injected collaborators for testing. Drop it in normal use to read the real config and TTY.
 */
export async function resolveTargetInstall(
	flags: Pick<FormatFlags, "game">,
): Promise<CanonicalPath> {
	if (flags.game)
		return resolveGamePath({ game: flags.game, cwd: process.cwd() });

	const installs = listInstalls();

	const [only, ...rest] = installs;

	if (!only)
		throw new Error(
			"No game install registered. Run `frontier game discover` to auto-discover game installs on the system, or pass `--game <sha|path>` to target the desired version by commit SHA or its path on your system",
		);

	if (rest.length === 0) return only.path;

	if (!process.stdin.isTTY)
		throw new Error(
			"Multiple game installs registered. Pass `--game <sha|path>` to target the desired version by commit SHA or its path on your system",
		);

	return pickInstall(installs);
}

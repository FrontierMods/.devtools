/**
 * @file Locate the game's json_formatter binary inside an install.
 */

import { existsSync } from "fs";
import path from "path";

/**
 * The formatter binary's name, with `.exe` only on Windows.
 */
export const FORMATTER_NAME =
	process.platform === "win32" ? "json_formatter.exe" : "json_formatter";

/**
 * Locates the formatter inside `gameDir`.
 *
 * @param gameDir The game install directory to look for the formatter in.
 */
export function locateFormatter(gameDir: string): string {
	const formatter = path.join(gameDir, FORMATTER_NAME);

	if (!existsSync(formatter))
		throw new Error(`No \`${FORMATTER_NAME}\` in ${gameDir}`);

	return formatter;
}

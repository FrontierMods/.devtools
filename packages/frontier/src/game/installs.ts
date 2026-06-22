/**
 * @file Hashing, listing, resolving, and discovering local CDDA installs by commit hash.
 */

import fs from "fs-extra";
import path from "path";
import { findFiles, type FinderResult } from "sysfind";
import { readGlobalConfig, writeGlobalConfig } from "../config/global.ts";
import { ConfigError } from "../config/error.ts";
import { extractErrorMessage } from "../error.ts";
import { normalizePath, toCanonicalPath } from "../file/paths.ts";
import { logger } from "../logger.ts";
import { getAtPath } from "../object/access.ts";
import type { CanonicalPath, JSONObject } from "../types/data.ts";
import { isObject } from "../types/guards.ts";
import { isSHA, parseSHA, type SHA } from "./sha.ts";

/**
 * One registered install: its commit hash and the canonical install directory.
 */
export interface GameInstall {
	/** Commit hash that keys the install. */
	sha: SHA;
	/** Canonical install directory. */
	path: CanonicalPath;
}

/**
 * Injected collaborators for discovery, so it runs without subprocesses or stdin in tests.
 */
export interface DiscoverDeps {
	/** Locates executables OS-wide, defaulting to finder's `findFiles`. */
	find?: (query: {
		names: string[];
		kind: "file" | "directory";
	}) => Promise<FinderResult>;
	/** Chooses one path among duplicates for a hash and returns the chosen index. */
	choose(sha: SHA, candidates: CanonicalPath[]): Promise<number>;
	/** Config file to write, defaulting to the user's global config. */
	file?: string;
}

/**
 * Inputs for resolving a single game install directory.
 */
export interface ResolveGamePathOptions {
	/** Explicit candidate: a `--game` flag or modconfig `game.path`. A SHA or a path. */
	game?: string;
	/** Base directory for resolving a relative path candidate. */
	cwd: string;
	/** Config file to read, defaulting to the user's global config. For tests. */
	file?: string;
}

/**
 * Property path under which installs live, keyed by hash.
 */
const INSTALL_PATH = ["game", "path"];

/**
 * Matches the `commit sha:` line of a CDDA `VERSION.txt`.
 */
const COMMIT_SHA_PATTERN = /^commit sha:\s*([0-9a-f]{40})\b/im;

/**
 * Child logger scoped to game-install operations.
 */
const LOGGER = logger.getChild("game");

/**
 * per-platform CDDA executable names handed to finder.
 */
const EXECUTABLES: Record<string, string[]> = {
	win32: ["cataclysm-tiles.exe", "cataclysm.exe"],
	linux: ["cataclysm-tiles", "cataclysm-launcher"],
	darwin: ["Cataclysm.app"],
};

/**
 * Derives the commit hash of the install at `rawPath` from its `VERSION.txt`.
 *
 * Hard-errors on a missing directory, a non-directory, or an absent or unparseable `VERSION.txt`. The hash is the storage key, so there is no entry without it.
 *
 * @param rawPath Install directory to hash.
 *
 * @returns The commit hash read from the install's `VERSION.txt`.
 *
 * @throws {@link ConfigError} When the path is missing, is not a directory, or has no parseable `commit sha` in `VERSION.txt`.
 */
export function hashFromInstall(rawPath: string): SHA {
	const install = toCanonicalPath(rawPath);

	if (!fs.pathExistsSync(install))
		throw new ConfigError(`Game path does not exist: ${install}`);

	if (!fs.statSync(install).isDirectory())
		throw new ConfigError(`Game path is not a directory: ${install}`);

	const versionFile = path.join(install, "VERSION.txt");

	if (!fs.pathExistsSync(versionFile))
		throw new ConfigError(
			`No \`VERSION.txt\` in ${install}; not a CDDA install`,
		);

	const match = fs
		.readFileSync(versionFile, "utf8")
		.match(COMMIT_SHA_PATTERN);

	const sha = match?.[1];

	if (!sha)
		throw new ConfigError(
			`No \`commit sha\` in ${versionFile}; not a CDDA install`,
		);

	return parseSHA(sha);
}

/**
 * Collects the installs from a `game.path` object, skipping malformed escape-hatch keys.
 *
 * @param node Candidate `game.path` object to read installs from.
 *
 * @returns The installs whose keys are valid hashes and whose values are strings.
 */
export function installsFrom(node: unknown): GameInstall[] {
	const installs: GameInstall[] = [];

	if (!isObject(node)) return installs;

	for (const [key, value] of Object.entries(node))
		if (isSHA(key) && typeof value === "string")
			installs.push({ sha: parseSHA(key), path: toCanonicalPath(value) });

	return installs;
}

/**
 * Reads the registered installs from the config's `game.path` object.
 *
 * @param file Config file to read, defaulting to the user's global config.
 *
 * @returns The registered installs from the config.
 */
export function listInstalls(file?: string): GameInstall[] {
	return installsFrom(getAtPath(readGlobalConfig(file), INSTALL_PATH));
}

/**
 * Resolves a single install path. With a `ref` (commit hash), returns its path or throws. With no ref, applies the fallback rule: zero throws, one is used, more than one requires an explicit ref.
 *
 * @param ref A commit hash to look up. Omit to apply the fallback rule.
 * @param file Config file to read, defaulting to the user's global config.
 *
 * @returns The canonical install directory for the resolved hash.
 *
 * @throws {@link ConfigError} When a given ref is unregistered, when no installs are configured, or when no ref is given but multiple installs are registered.
 */
export function resolveInstall(ref?: string, file?: string): CanonicalPath {
	const installs = listInstalls(file);

	if (ref !== undefined) {
		const sha = parseSHA(ref);
		const match = installs.find((install) => install.sha === sha);

		if (!match)
			throw new ConfigError(
				`No game install registered for commit \`${sha}\``,
			);

		return match.path;
	}

	const [only, ...rest] = installs;

	if (!only)
		throw new ConfigError(
			"No game install configured. Run `frontier game discover` or `frontier game add <path>`.",
		);

	if (rest.length === 0) return only.path;

	const hashes = installs.map((install) => install.sha).join(", ");

	throw new ConfigError(
		`Multiple game installs registered (${hashes}); pass \`--game <sha|path>\`.`,
	);
}

/**
 * Resolves a single game install directory.
 *
 * A SHA candidate is looked up in the registered installs. A path candidate is canonicalized (relative paths against `cwd`). With no candidate the installs fallback rule applies (zero throws, one is used, more than one is ambiguous).
 *
 * @param options Inputs for resolving the install directory.
 *
 * @returns The canonical game install directory.
 *
 * @throws {@link ConfigError} When a SHA candidate is unregistered, or when no candidate is given and the installs fallback rule cannot pick one.
 */
export function resolveGamePath(
	options: ResolveGamePathOptions,
): CanonicalPath {
	const { game, cwd, file } = options;

	if (!game) return resolveInstall(undefined, file);

	if (isSHA(game)) return resolveInstall(game, file);

	const normalized = normalizePath(game);

	return path.isAbsolute(normalized)
		? toCanonicalPath(normalized)
		: toCanonicalPath(path.join(cwd, normalized));
}

/**
 * Navigates to the live `game.path` object in `config`, creating it (and `game`) if absent.
 *
 * @param config Global config object to navigate and mutate in place.
 *
 * @returns The live `game.path` object within the config.
 */
export function gamePaths(config: JSONObject): JSONObject {
	const game = isObject(config.game) ? config.game : (config.game = {});
	const paths = isObject(game.path) ? game.path : (game.path = {});

	return paths;
}

/**
 * Discovers installs via finder and registers them. Reads the config once, folds finder hits into the already-stored installs, resolves per-hash duplicates via `choose`, mutates the in-memory `game.path` object, and writes once. Installs with an unparseable `VERSION.txt` are skipped with a warning.
 *
 * @param deps Injected collaborators for finding, choosing among, and persisting installs.
 *
 * @returns The installs registered after discovery.
 */
export async function discoverInstalls(
	deps: DiscoverDeps,
): Promise<GameInstall[]> {
	const find = deps.find ?? findFiles;
	const names = EXECUTABLES[process.platform] ?? [];
	const kind = process.platform === "darwin" ? "directory" : "file";

	const result = await find({ names, kind });
	const config = readGlobalConfig(deps.file);
	const paths = gamePaths(config);

	const candidatesByHash = new Map<SHA, Set<CanonicalPath>>();

	for (const install of installsFrom(paths))
		candidatesByHash.set(install.sha, new Set([install.path]));

	for (const match of result.matches) {
		const install = toCanonicalPath(path.dirname(match.path));

		let sha: SHA;

		try {
			sha = hashFromInstall(install);
		} catch (error) {
			LOGGER.warn(`Skipping ${install}: ${extractErrorMessage(error)}`);

			continue;
		}

		const candidates =
			candidatesByHash.get(sha) ?? new Set<CanonicalPath>();

		candidates.add(install);
		candidatesByHash.set(sha, candidates);
	}

	const installs: GameInstall[] = [];

	for (const [sha, set] of candidatesByHash) {
		const candidates = [...set];

		const index =
			candidates.length === 1 ? 0 : await deps.choose(sha, candidates);

		const chosen = candidates[index];

		if (!chosen) continue;

		paths[sha] = chosen;

		installs.push({ sha, path: chosen });
	}

	writeGlobalConfig(config, deps.file);

	return installs;
}

# `@frmds/autodoc`

`autodoc` is a `.devtools` plugin that compiles a _Cataclysm: Dark Days Ahead_ mod written in a higher-level, composable, DRY form down into game-ready JSON.

## Install

`autodoc` is a frontier plugin, so install it globally alongside the `frontier` CLI:

```sh
bun add -g @frmds/autodoc
```

Installing registers the plugin automatically. You can also register it manually:

```sh
frontier plugins add @frmds/autodoc
```

## Usage

In a mod directory containing a `frontier.json5`:

```sh
frontier run autodoc build
```

`autodoc build` does the following:

- reads your source files from the input directory (`./src` by default)
- resolves game-native `copy-from` inheritance across the mod's dependency chain
- applies built-in runtime derivations (e.g. `longest_side` from `volume`)
- runs the resolved objects through the configured transformers
- writes game-ready JSON to the output directory (`./json` by default)

Source files may be JSON or JSON5. Both compile to safe JSON.

### Flags

| Flag             | Description                                               | Default     |
| ---------------- | --------------------------------------------------------- | ----------- |
| `--input <dir>`  | Override the input directory                              | `./src`     |
| `--output <dir>` | Override the output directory                             | `./json`    |
| `--game <dir>`   | Override the game installation directory                  | from config |
| `--parallel <n>` | Objects to scan in parallel                               | `16`        |
| `--clean`        | Remove the output directory and all caches before running | off         |

## Configuration

Configure `autodoc` under the `autodoc` section of `frontier.json5`:

```json5
autodoc: {
  // maximum concurrent operations to run
	concurrency: 16,
	// transformers to run on build (see below)
	transformers: [
		{ package: "@frmds/transformers", export: "ALL_TRANSFORMERS" },
	],
}
```

- `transformers`: the transformers to load and run, in declaration order. None run unless declared. See below.
- `concurrency`: maximum concurrent operations during the scan phase. Defaults to `16`. The `--parallel` flag overrides it for a single run.

Input and output directories are resolved from the frontier-level config and can be overridden per run with `--input` and `--output`.

## Transformers

`autodoc` runs only the transformers you declare under `autodoc.transformers`, in declaration order. It ships with no default stack, so you must specify which transformers to run on each mod.

Each entry references transformers from an installed `package` or a local `module`, and runs them in declaration order:

```json5
autodoc: {
	transformers: [
		// every transformer in a package, via a named export
		{ package: "@frmds/transformers", export: "ALL_TRANSFORMERS" },

		// the package's `default` export (omit `export` to use it)
		{ package: "@frmds/transformers" },

		// several named exports from one package
		{ package: "@frmds/transformers", export: ["math", "quantities"] },

		// a local module, relative to the mod root
		{ module: "./transformers/my-transformer.ts" },

		// a local module by absolute path
		{ module: "/home/me/shared/transformers/index.ts", export: "default" },
	],
}
```

Each named export may hold a single transformer or an array of them. Transformers are deduplicated by name, keeping the first declaration.

## Incremental builds

`autodoc` caches build state under the mod's `.frontier/` directory. A second run with no source, dependency, or environment changes is near-instant: the freshness check confirms the previous outputs are still valid and exits without rebuilding.

Pass `--clean` to discard the output directory and all caches before building.

## Caveats

`autodoc` deliberately handles some object types specially. Watch for these in your output:

- **Skipped entirely.** `talk_topic` objects are neither loaded nor output. They allow multiple objects per ID (additive topic files), which neither our system nor the base game's one-object-per-ID model supports.
- **Loaded and output, but not transformed.** `effect_on_condition` and `enchantment` objects carry properties (such as native `math` objects) that collide with transformer inputs, so they pass through untransformed.
- **Never output.** `PARTIAL` and `FUNCTION` objects are internal types that support transformer functionality and are never valid DDA objects. `FUNCTION` is also skipped by transformation because it holds argument placeholders that aren't valid until invocation.

A native `math` object surviving in the output is expected for the untransformed types above.

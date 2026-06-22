# `@frmds/format`

`format` is a `.devtools` plugin that formats a directory of JSON files with the formatter _Cataclysm: Dark Days Ahead_ ships with (`json_formatter`), applying the game's own JSON style to your mod.

## Install

`format` is a frontier plugin, so install it globally alongside the `frontier` CLI:

```sh
bun add -g @frmds/format
```

Installing registers the plugin automatically upon installation. You can also register it manually:

```sh
frontier plugins add @frmds/format
```

It formats with the game's own `json_formatter`, so it needs a registered game install (`frontier game discover`).

## Usage

In the directory you want to format:

```sh
frontier run format
```

By default it walks the current directory for `**/*.json`. Pass a file or directory to scope the run instead:

```sh
frontier run format path/to/mod
```

With several game installs registered it prompts for one. Pass `--game <sha|path>` to choose without the prompt.

Use `--parallel <n>` to cap how many files format at once. `<n>` defaults to the CPU core count.

Each run reports how many files were formatted, were already clean, or failed.

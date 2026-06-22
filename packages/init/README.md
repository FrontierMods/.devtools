# `@frmds/init`

`init` is a `.devtools` plugin that scaffolds a `.devtools`-compatible _Cataclysm: Dark Days Ahead_ mod in the current directory.

## Install

`init` is a frontier plugin, so install it globally alongside the `frontier` CLI:

```sh
bun add -g @frmds/init
```

Installing registers the plugin automatically upon installation. You can also register it manually:

```sh
frontier plugins add @frmds/init
```

## Usage

In the directory where you want to create the mod (i.e. in `/mods/MyAwesomeMod`, not in `/mods`):

```sh
frontier run init
```

This creates the following files:

- `modinfo.json`: the game's mod manifest
- `frontier.json5`: toolkit configuration
- `.gitignore`: a Git ignore file with default configuration
- `src/`: your mod's source files (default; configure in `frontier.json5` if you want to change it)

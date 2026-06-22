# `@frmds/frontier`

`frontier` is the core package of [`.devtools`](https://github.com/FrontierMods/.devtools), the modding toolkit for _Cataclysm: Dark Days Ahead_.

On its own it does one thing: manage the toolkit's plugins installed on your system. Everything else it offers is a library of reusable components that those plugins build on. You install `frontier` once, register plugins against it, and run them through its CLI.

## Install

```sh
bun add -g @frmds/frontier
```

Frontier runs on [Bun](https://bun.sh) v1.3 or above.

## Managing plugins

Plugins are ordinary packages installed on your system. By default, plugins are registered automatically upon being installed. In case the script didn't fire, register one to enable its use:

```sh
frontier plugins add @frmds/autodoc

# show registered plugins and their status
frontier plugins list

# removes plugin registration
# does not delete the plugin itself, you must remove it manually
frontier plugins remove @frmds/autodoc
```

Once a plugin is registered and active, its commands are available under `run <plugin_exec_name>` (where `<plugin_exec_name>` is usually the plugin's package ID after the forward slash).

## Configuration

`frontier config` reads and writes the global toolkit config, the single store shared across every plugin:

```sh
# validate, store, and persist a value
frontier config set <key> <value>

# print a single value or a whole subtree
frontier config get <key>

# list everything currently set
frontier config list

# remove a single value
frontier config unset <key>

# erase all config
frontier config clear
```

## Game installs

`frontier game` discovers and manages local _Cataclysm: Dark Days Ahead_ installs, each keyed by its commit hash so plugins can target a specific build. Installs are stored in config under `game.path`.

```sh
# scan this system for existing installs and register each
frontier game discover

# register one install by its directory
frontier game add <path>

# list registered installs
frontier game list

# drop a registered install
frontier game remove <sha|path>
```

## For plugin authors

Frontier is also the shared library every plugin imports. Its public API groups the reusable components by concern:

- **Plugin system** defines, registers, and loads plugins and the routes they contribute
- **Mod resolver** locates and reads mods and their files
- **Object registry** tracks game objects on the per-transformation basis, for both reference and observability purposes
- **JSON patch layer** handles converting syntactic-sugar patches `.devtools` uses into proper JSON Patch calls
- **Cache and config services** provide content-addressed caching and config resolution
- **File, path, hash, and dependency utilities** cover discovery, canonical paths, hashing, and dependency sorting
- **Logging** is a shared structured logger

```ts
import { ModResolver, logger } from "@frmds/frontier";
```

The full surface lives in [`src/exports.ts`](./src/exports.ts).

## License

MIT

# `.devtools`

A plugin-based modding toolkit for _Cataclysm: Dark Days Ahead_.

This is the monorepo for the `.devtools` family of packages. You install the `frontier` CLI once, register plugins against it, and run them through its command line. Each plugin handles one concern, from compiling higher-level mod source to formatting and scaffolding.

## Packages

### `@frmds/frontier`

The core package. On its own it manages the toolkit's plugins installed on your system, and it is the shared library every plugin builds on.

```sh
bun add -g @frmds/frontier

# register a plugin (usually automatic on install) and run it
frontier plugins add @frmds/autodoc
frontier run autodoc build
```

See [`@frmds/frontier`](packages/frontier) for more information.

Note: the core package runs on [Bun](https://bun.sh) v1.3 or above.

### `@frmds/autodoc`

Compiles a mod written in a higher-level, composable, DRY form down into game-ready JSON:

```sh
bun add -g @frmds/autodoc

# in a mod directory containing `frontier.json5`
frontier run autodoc build
```

See [`@frmds/autodoc`](packages/autodoc) for more information.

You can use `@frmds/init` to initialize a toolkit-compatible mod structure

### `@frmds/transformers`

The shared library of `autodoc` transformers, the building blocks that turn higher-level source into game-ready JSON. Import the ones you want, or pull in every transformer at once, and reference them in your mod's `autodoc` configuration:

```ts
import { ALL_TRANSFORMERS, MATH_TRANSFORMER } from "@frmds/transformers";
```

See [`@frmds/transformers`](packages/transformers) for more information.

### `@frmds/format`

Formats a directory of JSON files with the formatter _Cataclysm: Dark Days Ahead_ ships with, applying the game's own style. It needs a registered game install.

```sh
bun add -g @frmds/format

# find install locations on the system
frontier game discover

# format the current directory
frontier run format
```

See [`@frmds/format`](packages/format) for more information.

### `@frmds/init`

Scaffolds a toolkit-compatible mod in the current directory:

```sh
bun add -g @frmds/init

# scaffold a new mod where you want it to live
frontier run init
```

See [`@frmds/init`](packages/init) for more information.

## License

MIT

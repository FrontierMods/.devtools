# `frontier`

## Purpose

`frontier` is the core runner of the toolkit, providing shared infrastructure reusable by any tool. By itself, does nothing other than managing plugins. Plugins hold any functionality that changes mod data.

## Success Criteria

`frontier` does its job well if:

- plugins can be registered from installed packages
- plugins can be listed
- plugins can be de-registered; once de-registered, plugins can no longer be invoked
- plugins can only run within the `frontier` harness
- plugins can import much of their core or basic functions from `frontier`
- mod data (from `modinfo.json`) is resolved correctly
- mods inside other mods are recognized as independent mods and do not pollute parent mods' data
- mod dependencies are resolved correctly
- missing mod dependencies are reported clearly
- game/mod object data is resolved accurately

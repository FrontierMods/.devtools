# `autodoc`

## Purpose

`autodoc` lets mod authors write their content in a higher-level, composable, DRY form and compiles it down into game-ready JSON.

## Success Criteria

`autodoc` does its job well if:

- it outputs source JSON/JSON5 as safe JSON
- with at least one tool, it processes source according to the tool's specification
- which tools `autodoc` uses for a given mod can be configured by the mod author at the mod config level
- tools can be supplied to `autodoc` locally (i.e. from mod author's machine) at runtime
- if all appropriate tools are provided by mod author, output is game-ready
- if cache is configured, the second (cached) run on the same mod with no changes is near-instant compared to the first (uncached)

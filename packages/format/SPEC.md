# `format`

## Purpose

`format` uses the formatter the game ships with to format the target directory of JSON files to suit the game's own style. It is meant as a one-liner way to apply game's JSON style to the mod, for both mod authors and game contributors.

## Success Criteria

`format` does its job well if:

- the overhead over using the formatter directly is less than 10%
- running it over a directory of JSON files formats those files to the game's own style
- no other files are touched
- it is more convenient to use than the formatter directly

// The drop-in this competition races: parse(markdown) returns the HTML marked 18.1.3 renders with its
// default options (GFM on, async off). Dependency-free: the renderer is the vendored marked build in
// ./vendor/marked/marked.esm.js (MIT, vendor/marked/LICENSE), patched in place with literal-character
// guards on the tokenizer's anchored mega-regexes (technique and rationale in README.md). The speed
// lives in that vendored bundle, so this module stays a thin, allocation-free pass-through.

import { marked } from './vendor/marked/marked.esm.js';

/** The HTML marked renders for `markdown`, with marked's defaults. */
export function parse(markdown) {
  return marked.parse(markdown);
}

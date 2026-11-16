// The drop-in this competition races: parse(markdown) returns exactly the string marked 18.1.3
// renders with its default options (GFM on, async off).
//
// The speed lives in ./vendor/marked/marked.esm.js, marked's npm build with literal-character
// guards spliced into its two tokenizer loops (technique and rationale in README.md; provenance
// and exact edit count in vendor/marked/NOTICE). This module stays a thin, allocation-free
// pass-through, so the whole cost is the tokenizer work that is actually needed.

import { marked } from './vendor/marked/marked.esm.js';

/** The HTML marked renders for `markdown`, with marked's defaults. */
export function parse(markdown) {
  return marked.parse(markdown);
}

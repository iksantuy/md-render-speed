// parse.js — drop-in for make.fun's markdown-render-speed-02.
//
// parse(markdown) returns exactly the HTML marked 18.1.3 renders with its default options
// (GFM on, async off). The speed lives in the vendored bundle: vendor/marked/marked.esm.js
// carries literal-character guards spliced into marked's inline and block tokenizer loops,
// so a rule's anchored mega-regex is only attempted when its first character is present —
// a necessary condition that cannot change output. See README.md for the technique;
// vendor/marked/LICENSE and vendor/marked/NOTICE cover marked's MIT licence.

import { marked } from './vendor/marked/marked.esm.js';

/** The HTML marked renders for `markdown`, with marked's defaults. */
export function parse(markdown) {
  return marked.parse(markdown);
}

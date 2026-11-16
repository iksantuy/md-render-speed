// parse.js — drop-in for make.fun's markdown-render-speed-02.
//
// parse(markdown) returns exactly the HTML marked 18.1.3 renders with its default
// options (GFM on, async off), and does it faster.
//
// How: marked's tokenizer tries ~1.2M anchored mega-regexes per pass over the
// practice set, and almost none of them can possibly match at the position they
// are tried (escape matches 1.3% of its calls, tag 3.4%, link 5.7%, emStrong
// 13.2%, the block rules under 10%). Every one of those rules is anchored at ^
// and starts with a literal or a small character class, so testing that first
// character (block rules: the first character that is not one of up to three
// leading spaces) is a NECESSARY condition for the regex to match. This module
// wraps Tokenizer.prototype methods: the cheap check runs first, and only when
// it passes does marked's untouched original method run. No rule, renderer or
// token shape is changed, so the output is byte-identical; only work that could
// not have produced a token is skipped.

import { marked, Tokenizer } from './vendor/marked/marked.esm.js';

const T = Tokenizer.prototype;

/**
 * True when, after skipping at most `lead` leading spaces, the first character
 * that is not a space has one of the codes in `codes`.
 */
function leadChar(s, codes, lead) {
  const n = s.length < lead + 1 ? s.length : lead + 1;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 32) continue;
    for (let k = 0; k < codes.length; k++) if (c === codes[k]) return true;
    return false;
  }
  return false;
}

/** Replace T[name] with a version that runs `cheap` first and marked's own method only if it passes. */
function guard(name, cheap) {
  const orig = T[name];
  T[name] = function guarded(s) {
    if (!cheap(s)) return undefined;
    return orig.apply(this, arguments);
  };
}

// ---------------------------------------------------------------- block rules
// html:      ^ {0,3}<
guard('html', (s) => leadChar(s, [60], 3));
// def:       ^ {0,3}\[
guard('def', (s) => leadChar(s, [91], 3));
// blockquote:^ {0,3}>
guard('blockquote', (s) => leadChar(s, [62], 3));
// heading:   ^ {0,3}(#{1,6})(?=\s|$)
guard('heading', (s) => leadChar(s, [35], 3));
// fences:    ^ {0,3}(`{3,}|~{3,})
guard('fences', (s) => leadChar(s, [96, 126], 3));
// hr:        ^ {0,3}((-[ \t]*){3,}|(_[ \t]*){3,}|(\*[ \t]*){3,})
guard('hr', (s) => leadChar(s, [45, 95, 42], 3));
// code:      ^((?: {4}| {0,3}\t)[^\n]+ ...)+
// the first token is four spaces, or up to three spaces then a tab.
guard('code', (s) => {
  let i = 0;
  while (i < 3 && s.charCodeAt(i) === 32) i++;
  if (s.charCodeAt(i) === 9) return true;
  return s.charCodeAt(0) === 32 && s.charCodeAt(1) === 32 && s.charCodeAt(2) === 32 && s.charCodeAt(3) === 32;
});
// list:      ^ {0,3}((?:[*+-]|\d{1,9}[.)]))
guard('list', (s) => {
  const n = s.length < 4 ? s.length : 4;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 32) continue;
    if (c === 42 || c === 43 || c === 45) return true; // * + -
    if (c >= 48 && c <= 57) {
      // a digit run of 1..9 followed by '.' or ')'
      let j = i;
      while (j < s.length && j - i < 9) {
        const d = s.charCodeAt(j);
        if (d < 48 || d > 57) break;
        j++;
      }
      if (j - i > 9) return false;
      const e = s.charCodeAt(j);
      return e === 46 || e === 41; // . )
    }
    return false;
  }
  return false;
});
// table:     needs a header line and a delimiter line, so a newline after index 0
guard('table', (s) => s.indexOf('\n') > 0);
// lheading:  needs a second line of '=' or '-'
guard('lheading', (s) => s.indexOf('\n') > 0);

// --------------------------------------------------------------- inline rules
// escape:    ^\\([!...])
guard('escape', (s) => s.charCodeAt(0) === 92);
// tag:       every alternative starts with '<'
guard('tag', (s) => s.charCodeAt(0) === 60);
// codespan:  ^(`+)([^`]|...)
guard('codespan', (s) => s.charCodeAt(0) === 96);
// link:      ^!?\[
guard('link', (s) => s.charCodeAt(0) === 91 || (s.charCodeAt(0) === 33 && s.charCodeAt(1) === 91));
// reflink:   ^!?\[ (both alternatives)
guard('reflink', (s) => s.charCodeAt(0) === 91 || (s.charCodeAt(0) === 33 && s.charCodeAt(1) === 91));
// emStrong:  ^\*+... | ^_+...
guard('emStrong', (s) => {
  const c = s.charCodeAt(0);
  return c === 42 || c === 95;
});
// del:       ^(~~?)
guard('del', (s) => s.charCodeAt(0) === 126);
// br:        ^( {2,}|\\)\n
guard('br', (s) => {
  const c = s.charCodeAt(0);
  return c === 32 || c === 92;
});
// autolink:  ^<
guard('autolink', (s) => s.charCodeAt(0) === 60);
// url:       ^(mailto:|xmpp:|(https?|ftp)://|www\.) or ^<email>
// The scheme branches begin with h/H/f/F/w/W; mailto:, xmpp: and the bare
// email branch all require an '@' after the first character.
guard('url', (s) => {
  const c = s.charCodeAt(0);
  if (c === 104 || c === 72 || c === 102 || c === 70 || c === 119 || c === 87) return true;
  return s.indexOf('@') > 0;
});

/** The HTML marked renders for `markdown`, with marked's defaults. */
export function parse(markdown) {
  return marked.parse(markdown);
}

export { marked };

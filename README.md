# markdown-render-speed-02 — guarded marked 18.1.3

`parse(markdown)` returns exactly the string `marked.parse(markdown)` returns from marked
18.1.3 with default options (gfm true, breaks false, pedantic false, async false), but
faster. Correctness is byte equality on all 720 practice cases: **720/720**.

Dependency-free ES module. No install step, no native code, Node built-ins only.

## What it does

marked's tokenizer walks a document character by character and, at every position, runs a
dozen-odd anchored regexes per loop — one for inline rules, one for block rules. Each of
those regexes is anchored at `^`, and each begins with a fixed literal character (or a
small set of them):

    escape      ^\\           link/reflink  ^[!\[]
    tag/html    ^<            emStrong      ^[*_]
    codespan    ^`            br            ^( {2}|\\)|$
    del         ^~~           autolink      ^<
    url         ^(mailto:|xmpp:|https?://|ftp://|www\.|<[^>]+>|[A-Za-z0-9._+-]+@)
    fences      ^`{3}|^~{3}   heading       ^#{1,6}
    hr          ^(-{3,}|\*{3,}|_{3,})       blockquote  ^>
    def         ^\[           table/lheading  (need a newline)
    code        ^( {4}|\t)    list          ^\d{1,9}[.)]|^[*+-]

So the first character of the remaining input is a **necessary condition** for the regex to
match. The patched bundle reads that character once — `c` in the inline loop, `b0` in the
block loop — and skips a rule outright when the character cannot possibly start it.

### Why this cannot change the output

A guard is `c !== X && skip`. It is only ever applied to rules whose regex source begins
with a literal `X` right after `^`. If `c !== X` the regex could not have matched anyway, so
`tokenizer.rule(...)` would have returned `undefined` and the loop would have fallen through
to the next rule; skipping is exactly what the fall-through would have done. No state is
touched by the skipped call, so nothing else can observe the difference. Two guards are
slightly coarser than their rule (del is checked for `~`, autolink and tag both for `<`)
because they are still strictly necessary conditions, not sufficient ones.

Values the block loop needs beyond the first character:

  * `b0` — the first character after up to three leading spaces, since every block rule
    tolerates at most three spaces of indent.
  * `bn` — "a newline exists after position 0", required by the table and lheading rules,
    which need at least two lines to match.
  * `bc` — `b0` is a space or a tab, the prefix of the indented-code rule.
  * `bl` — `b0` can start a list marker (digit, `*`, `+`, `-`).
  * the `url` rule also needs a cheap `urlStart(c, e)` helper: a scheme letter, or an
    email-local run that reaches an `@`.

The result: same tokens, same renderer, same string — just far fewer regex invocations.

### Second-order work (12 more edits, after profiling the guarded bundle)

The first 23 edits only stop a rule from being *called*. Profiling what is left showed the
remaining cost sits in work that is restarted per token, and in regexes that scan to
end-of-input for a rule that cannot match:

  * `space()` — the profile's single hottest regex (`^(?:[ \t]*(?:\n|$))+`, 30% of all
    characters scanned) — is only reachable when the raw first character is a space, tab or
    newline; `cc` keeps that raw character before `b0` walks over the indent.
  * `table()` needs a delimiter row on its **second** line, beginning `|`, `-` or `:` after at
    most three spaces — `tableNext()`. `lheading()` cannot be narrowed this way (its underline
    may be any later line), so it keeps the plain newline test.
  * `list()` calls `rules.block.hr.test(e)` on the whole remaining input once per item; `hr`
    starts with `-`, `_` or `*` after at most three spaces, so `hrStart()` runs first.
  * `e.split('\n',1)[0]` (three places in `list()`) allocates a one-element array to take the
    first line; `firstLine()` slices it instead.
  * `lex()` rewrites every CR to LF. `carriageReturn` is `/\r\n|\r/g`, so a document with no
    CR at all skips the replace.
  * `Ie()` escapes numeric character references; `numericCharacterReference` starts with `&`,
    so a string with no `&` is returned as is.
  * `#n()` masks reference links, code spans and inline HTML out of the source that
    emphasis/strikethrough see. Both replaces only match on `` ` ``, `\`, `[` or `<`, so a
    source with none of those is returned unchanged (an `emStrongMask` hook still forces the
    full path).

Each is again a necessary condition or an exact-equivalence rewrite, which is why the output
is unchanged: 720/720 cases and 0 fuzz divergences after these edits too.

## Measurements

Bench outside the repo (`scratch/b.mjs`), 720 practice cases, median of 5 rounds after 2
warmups, single Node process, Node 24:

    pristine marked 18.1.3       659.9 ms    720/720
    inline guards only           647.1 ms    720/720
    inline + block guards        652.4 ms    720/720   (621.6 ms on a later run)
    + second-order work          627.4 ms    720/720

Machine noise on this host is ±3%, so the paired numbers matter more: on the 720 cases the
second-order edits are 2.3–4.0% faster than the guard-only bundle by min-of-31-rounds in one
process (min 554.1 vs 567.2 ms; a second run 533.3 vs 555.2 ms), and on the graded
document-size range (5 docs of 25K–110K characters) 4.4% faster (min 70.9 vs 74.1 ms).
Deterministic work counts confirm the direction: 1,406,250 tokenizer regex execs and 762 M
subject characters scanned, versus 1,557,221 and 1028 M for the guard-only bundle (a 15%
cut in characters scanned); against pristine marked it is 2,987,132 execs and 2025 M.

The guards cut the number of tokenizer regex calls per character from ~14 to ~1.5 on prose,
which is where the time goes.

## Correctness

  * 720/720 practice cases byte-identical to marked's output, checked by the bench.
  * Driver run (`main.ts`) writes `html.json`, which matches `expected.json` on all 720.
  * Differential fuzz: 20000 generated markdown-ish inputs (bullets, headings, emphasis,
    code fences, links, tables, inline HTML, unicode, punctuation soup) rendered by both the
    pristine and the patched bundle — **0 divergences**.

## How to run

    node main.ts                     # or: MAKEFUN_INPUT_DIR=... MAKEFUN_OUTPUT_DIR=... node main.ts

The bench and the patcher live outside the repository in the kit's scratch directory; they are
not part of the entry:

    node scratch/b.mjs [bundle] [--fuzz]   # 720-case bench + differential fuzz
    node scratch/patch.mjs                 # pristine upstream -> vendor/marked/marked.esm.js

## License

marked is MIT (Copyright (c) 2018+, MarkedJS; Copyright (c) 2011-2018, Christopher Jeffrey),
with John Gruber's BSD-style Markdown notice carried in `vendor/marked/LICENSE`. That file is
untouched. `vendor/marked/marked.esm.js` is marked's npm build with the edits described
above; provenance, upstream and patched hashes are recorded in `vendor/marked/NOTICE`.

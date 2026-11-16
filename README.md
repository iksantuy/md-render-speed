# markdown-render-speed-02 — guarded marked 18.1.3

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/iksantuy/md-render-speed/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/iksantuy/md-render-speed/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

`parse(markdown)` returns exactly the string `marked.parse(markdown)` returns from marked
18.1.3 with default options (gfm true, breaks false, pedantic false, async false), but
faster. Correctness is byte equality on all 720 practice cases: **720/720**.

Dependency-free ES module. No install step, no native code, Node built-ins only.

## Layout

    parse.js                   export function parse(markdown) -> marked.parse(markdown)
    main.ts                    driver: $MAKEFUN_INPUT_DIR/cases.json -> $MAKEFUN_OUTPUT_DIR/html.json
    vendor/marked/marked.esm.js  marked 18.1.3 build + literal-character guards
    vendor/marked/LICENSE      marked's MIT license (unchanged)
    vendor/marked/NOTICE       provenance and the list of edits

## Technique: literal-character guards on anchored tokenizer regexes

marked's tokenizer runs a family of anchored mega-regexes against the remaining input at
every position of both loops:

- inline loop (`Lexer.lexInline`) — 10 `^`-anchored rules, each tried at every character
- block loop (`Lexer.blockTokens`) — 10 more, each tried at every block start

A `^`-anchored regex whose first pattern element is a literal character (or a small set of
literal alternatives, or a `[class]`) cannot possibly match unless the current character is
one of those. Testing the character first is therefore a **necessary condition**, so
short-circuiting on it cannot change any output — it only skips the call.

The guards are spliced **into** the vendored bundle rather than wrapped around the tokenizer
methods. Reasons, both measured:

- a per-call JS wrapper adds a call frame and an argument shuffle to every one of the ~20
  rules per position, which costs more than the regex attempt it saves;
- overriding `emStrong`/`del` from outside forces marked's expensive inline-text masking
  path, which is a large net loss.

Cost at the top of each loop iteration: one `charCodeAt`. Savings: up to 10 regex attempts
per inline position and up to 10 per block start.

### Inline loop

`c = e.charCodeAt(0)`, then each rule is guarded by its rule's leading literal:

| rule | guard | leading literal of the pattern |
|---|---|---|
| escape | `c===92` | `\` |
| tag | `c===60` | `<` |
| link | `c===91\|\|c===33` | `[` or `![` |
| reflink | `c===91\|\|c===33` | `[` or `![` |
| emStrong | `c===42\|\|c===95` | `*` or `_` |
| codespan | `c===96` | `` ` `` |
| br | `c===32\|\|c===92` | two spaces or `\` |
| del | `c===126` | `~` |
| autolink | `c===60` | `<` |
| url | `urlStart(c, e)` | scheme letter, or an email-local run containing `@` |

`url` is the one rule whose leading literal is a character *class*, not a fixed char: it is
`^(mailto:|xmpp:)`, `^((https?|ftp)://|www\.)`, `^<email>` or `^[A-Za-z0-9._+-]+@`. The helper
`urlStart` returns true when the first character is a possible scheme initial
(`h H f F w W m M x X`), or when the leading `[A-Za-z0-9._+-]` run contains an `@` — the only
way the email alternative can match.

### Block loop

`b0` is the first character after up to three leading spaces, `bn` says a newline exists past
index 0, `bc` says `b0` is a space/tab (indented-code prefix), `bl` says `b0` can start a list
marker:

| rule | guard | leading literal of the pattern |
|---|---|---|
| fences | `b0===96\|\|b0===126` | `` ``` `` or `~~~` |
| heading | `b0===35` | `#{1,6} ` |
| hr | `b0===45\|\|b0===95\|\|b0===42` | `-`, `_`, `*` |
| blockquote | `b0===62` | `>` |
| html | `b0===60` | `<` |
| def | `b0===91` | `[` |
| table | `bn` | needs a following row, so a newline |
| lheading | `bn` | same |
| code | `bc` | 4 spaces or a tab |
| list | `bl` | digit, `*`, `+`, `-` |

## Correctness

All 720 practice cases, byte for byte against `practice/reference/expected.json`:

    correct   : 720/720

No expected output was edited, and no case is special-cased.

## Run it

    MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts

Reads `$MAKEFUN_INPUT_DIR/cases.json` (array of `{id, markdown}`), writes
`$MAKEFUN_OUTPUT_DIR/html.json` (array of HTML strings, same order, one `parse()` per case).
Outside a container point the two variables at local directories.

## License

marked is MIT: Copyright (c) 2018+, MarkedJS; Copyright (c) 2011-2018, Christopher Jeffrey;
the bundled LICENSE also carries the original Markdown BSD-style notice
(Copyright 2004, John Gruber). `vendor/marked/LICENSE` is marked's license, unmodified, and
`vendor/marked/NOTICE` records the provenance and the exact edits. Everything else in this
repository is MIT as well; see `LICENSE`.

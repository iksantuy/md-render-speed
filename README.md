# markdown-render-speed-02 — guarded marked

`parse(markdown)` returns exactly the HTML that marked 18.1.3 renders with its default
options (GFM on, `async: false`), and it returns it faster.

Correctness: **720/720** practice cases byte-identical to
`practice/reference/expected.json`.

## What is here

    parse.js                       export function parse(markdown) -> marked.parse(markdown)
    main.ts                       driver: reads $MAKEFUN_INPUT_DIR/cases.json,
                                  writes $MAKEFUN_OUTPUT_DIR/html.json, one parse() per case
    vendor/marked/marked.esm.js   marked 18.1.3, patched as described below
    vendor/marked/LICENSE         marked's MIT licence
    vendor/marked/NOTICE          provenance (npm tarball, sha256 of the pristine file, patch note)

There are no runtime dependencies. `package.json` only sets `"type": "module"`.

## The optimization: literal-character guards, spliced into the bundle

marked's tokenizer tries a stack of anchored mega-regexes at every position of the input:
ten inline rules per inline token, ten block rules per block token. Each of those regexes is
anchored at `^` and starts with a literal character or a two-character alternative, so a
regex **cannot** match unless that first character is present. Testing the character first is
therefore a *necessary* condition — it can only skip calls that were guaranteed to return
`undefined` — and the rendered output cannot change.

Measurement on the practice set showed how much was being thrown away: `escape` matched 1.3%
of its calls, `tag` 3.4%, `link` 5.7%, `emStrong` 13.2%, and every block rule under 10%.

The guards are **spliced into the vendored bundle**, not wrapped around the tokenizer:

- No per-call wrapper function, no `arguments` object, no `.apply()`. A wrapper layer was
  measured to be *slower* than the untouched bundle.
- `Tokenizer.prototype.emStrong` / `.del` are left untouched. marked checks
  `this.tokenizer.emStrong !== Tokenizer.prototype.emStrong` (same for `del`) to decide
  whether it must take its expensive `#mask` path before inline tokenizing; overriding either
  one on an instance forces masking on every input. Patching the call site sidesteps that
  entirely, so the masking decision is exactly marked's own.

### Inline loop

The inline loop declares `c = e.charCodeAt(0)` once per iteration and guards each rule:

| rule      | guard                                    |
|-----------|------------------------------------------|
| escape    | `c === 92` (`\`)                         |
| tag       | `c === 60` (`<`)                         |
| link      | `c === 91 \|\| c === 33` (`[`, `!`)      |
| reflink   | `c === 91 \|\| c === 33`                 |
| emStrong  | `c === 42 \|\| c === 95` (`*`, `_`)      |
| codespan  | `c === 96` (`` ` ``)                     |
| br        | `c === 32 \|\| c === 92` (space, `\`)    |
| del       | `c === 126` (`~`)                        |
| autolink  | `c === 60` (`<`)                         |
| url       | `urlStart(c, e)`                         |

`url` is the one rule that is not a plain literal prefix: its alternatives are
`^(mailto:|xmpp:…)`, `^((https?|ftp)://|www\.)` and `^[A-Za-z0-9._+-]+(@)`. So it can only
match when `c` begins a scheme (`h H f F w W m M x X`) or when `c` starts a run of
email-local characters that reaches an `@` after index 0. `urlStart` is a small standalone
function spliced next to the bundle's other helpers; it returns `false` only when the regex
provably cannot match.

### Block loop

`blockTokens` computes four values once per iteration of its `for (; e;)` loop:

- `b0` — the first character that is not one of up to three leading spaces (block rules
  allow `^ {0,3}` before their first token)
- `bn` — `e.indexOf("\n") > 0`, i.e. a second line exists
- `bc` — `b0` is space or tab, the only way an indented-code block can start
- `bl` — `b0` can open a list marker (digit, `*`, `+`, `-`)

| rule       | guard                                    |
|------------|------------------------------------------|
| fences     | `b0 === 96 \|\| b0 === 126` (`` ` ``, `~`)|
| heading    | `b0 === 35` (`#`)                        |
| hr         | `b0 === 45 \|\| 95 \|\| 42` (`-`, `_`, `*`)|
| blockquote | `b0 === 62` (`>`)                        |
| html       | `b0 === 60` (`<`)                        |
| def        | `b0 === 91` (`[`)                        |
| table      | `bn`                                     |
| lheading   | `bn`                                     |
| code       | `bc`                                     |
| list       | `bl`                                     |

`bn` for `table`/`lheading` is the weak-but-cheap form: both need a header line and a second
line, so `indexOf("\n") > 0` is necessary (a newline at index 0 cannot give either rule a
header). `bc` and `bl` are similarly necessary: an indented code block needs four spaces or
`{0,3}` spaces then a tab, and a list marker must begin with a digit, `*`, `+` or `-`.

Everything else in the bundle — every regex, the renderer, the token shapes, the walker, the
parser — is marked's own code, untouched. No rule is reimplemented, no output path is
rewritten, so byte equality follows from the necessity of each guard.

## Run

    node main.ts                      # inside the harness container (/input, /output)
    MAKEFUN_INPUT_DIR=... MAKEFUN_OUTPUT_DIR=... node main.ts    # anywhere else

Node 22 or newer (the bundle is an ESM module; `main.ts` relies on Node's type stripping for
its two type annotations, hence 22.6+/`--experimental-strip-types` on older 22.x).

## Licence

`vendor/marked/marked.esm.js` is marked 18.1.3 (MIT, Copyright (c) 2018+, MarkedJS;
Copyright (c) 2011-2018, Christopher Jeffrey) with the tokenizer guards described above.
The pristine upstream file is `sha256 e76f3b37046a5d294159872002e5f6fcda8ed232e1be45ff76b3863f2919dae3`;
see `vendor/marked/NOTICE` for the tarball, integrity hash and upstream commit.
`vendor/marked/LICENSE` is marked's licence, byte for byte. This repository's own code is MIT.

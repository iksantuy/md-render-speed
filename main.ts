// markdown-render-speed-02 entry point.
//
// The harness runs `node /bot/main.ts`. We read the whole case list from
// $MAKEFUN_INPUT_DIR/cases.json (an array of {id, markdown}), render every case exactly once
// with parse() from ./parse.js, and write $MAKEFUN_OUTPUT_DIR/html.json: a JSON array whose
// n-th string is parse(cases[n].markdown). Order and count are preserved, so the scorer can
// compare element by element against marked's own output.
//
// parse.js is dependency-free; all of marked 18.1.3 is vendored under ./vendor/marked/.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

type Case = { id: string; markdown: string };

const inDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const cases: Case[] = JSON.parse(readFileSync(join(inDir, 'cases.json'), 'utf8'));

// Preallocate so the render loop allocates nothing but the output strings themselves.
const rendered: string[] = new Array(cases.length);
for (let n = 0; n < cases.length; n++) {
  rendered[n] = parse(cases[n].markdown);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'html.json'), JSON.stringify(rendered));

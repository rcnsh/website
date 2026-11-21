import assert from "node:assert/strict";
import { test } from "node:test";
import { findComments, kindOf } from "./comments.ts";

const texts = (source: string, kind: Parameters<typeof findComments>[1]) =>
  findComments(source, kind).map((c) => c.text);

test("finds line, block and doc comments in TypeScript", () => {
  const source = "/** doc */\nconst a = 1; // trailing\n/* block */\nconst b = '// not one';\n";
  assert.deepEqual(texts(source, "ts"), ["/** doc */", "// trailing", "/* block */"]);
});

test("leaves directives alone", () => {
  const source = [
    "/// <reference types=\"x\" />",
    "// @ts-expect-error",
    "// biome-ignore lint/a: b",
    "import(/* @vite-ignore */ url);",
    "const s = /* glsl */ `x`;",
  ].join("\n");
  assert.deepEqual(texts(source, "ts"), []);
});

test("finds JSX comments but not JSX text that looks like one", () => {
  const source = "const x = <div>{/* gone */}<a href='http://x'>// text</a></div>;\n";
  assert.deepEqual(texts(source, "tsx"), ["/* gone */"]);
});

test("counts own lines, not lines shared with code", () => {
  const [own, trailing] = findComments("// one\n// two\nx(); // three\n", "ts").reduce<
    [number, number]
  >((acc, c) => (c.ownLines ? [acc[0] + c.ownLines, acc[1]] : [acc[0], acc[1] + 1]), [0, 0]);
  assert.equal(own, 2);
  assert.equal(trailing, 1);
});

test("finds every Astro comment kind, including a frontmatter closed mid-line", () => {
  const source = [
    "---",
    "// fm",
    "const a = [1];---",
    "<!-- html -->",
    "<p>{/* expr */ a}</p>",
    "<p>https://example.com // prose</p>",
    "<script>// script</script>",
    "<style>/* style */ p { color: red }</style>",
  ].join("\n");
  assert.deepEqual(texts(source, "astro").sort(), [
    "/* expr */",
    "/* style */",
    "// fm",
    "// script",
    "<!-- html -->",
  ]);
});

test("finds CSS, YAML and SQL comments outside strings", () => {
  assert.deepEqual(texts("a { content: '/* no */'; } /* yes */", "css"), ["/* yes */"]);
  assert.deepEqual(texts("a: 1 # yes\nb: '# no'\nc: x#y\n", "yaml"), ["# yes"]);
  assert.deepEqual(texts("-- yes\n--> statement-breakpoint\nSELECT 1;\n", "sql"), ["-- yes"]);
});

test("finds comments inside a glsl template but not its interpolations", () => {
  const source = "const s = /* glsl */ `\n  float x; // shader\n  ${a /* ts */}\n`;\n";
  assert.deepEqual(texts(source, "ts").sort(), ["/* ts */", "// shader"]);
});

test("treats an unmarked template holding void main as a shader", () => {
  const source = "const f = `\nvoid main() {\n  // shader\n}`;\nconst u = `https://x`;\n";
  assert.deepEqual(texts(source, "ts"), ["// shader"]);
});

test("an Astro brace or comment marker inside a string is not structure", () => {
  assert.deepEqual(texts('<code>{"{"}</code>\n<p>{/* leak */ x}</p>', "astro"), [
    "/* leak */",
  ]);
  assert.deepEqual(texts("<div data-x='{'>{/* leak */}</div>", "astro"), ["/* leak */"]);
  assert.deepEqual(texts('<p>{"<!-- not -->"}</p>', "astro"), []);
  assert.deepEqual(texts("<p>{ok && <b>don't</b>}</p>\n<!-- yes -->", "astro"), ["<!-- yes -->"]);
  assert.deepEqual(texts('---\nconst s = "---";\n// fm\n---\n<p/>', "astro"), ["// fm"]);
  assert.deepEqual(texts("<script type='application/json'>{\"a\": \"//\"}</script>", "astro"), []);
});

test("YAML quotes, escapes and block scalars", () => {
  assert.deepEqual(texts("run: echo don't # leak\n", "yaml"), ["# leak"]);
  assert.deepEqual(texts('a: "x \\" # not"\n', "yaml"), []);
  assert.deepEqual(texts("body: |\n  ## Heading\n  text\nnext: 1 # yes\n", "yaml"), ["# yes"]);
});

test("SQL block comments and quoted dashes", () => {
  assert.deepEqual(texts("/* leak */\nSELECT 1;\n", "sql"), ["/* leak */"]);
  assert.deepEqual(texts("INSERT INTO t VALUES ('a -- b');\n", "sql"), []);
});

test("only real directives are exempt", () => {
  assert.deepEqual(texts("// eslint-style prose\n", "ts"), ["// eslint-style prose"]);
  assert.deepEqual(texts("/** @jsxImportSource preact */\n", "ts"), []);
});

test("knows which files it can read", () => {
  assert.equal(kindOf("a/b.tsx"), "tsx");
  assert.equal(kindOf("x.mjs"), "ts");
  assert.equal(kindOf(".github/workflows/ci.yml"), "yaml");
  assert.equal(kindOf("public/_redirects"), "hash");
  assert.equal(kindOf("README.md"), null);
});

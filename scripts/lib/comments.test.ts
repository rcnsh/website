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

test("Astro: self-closing scripts, regex literals and fences inside strings", () => {
  assert.deepEqual(
    texts('<script is:inline set:html={X} />\n<!-- found -->\n<script>import "./x";</script>', "astro"),
    ["<!-- found -->"],
  );
  assert.deepEqual(
    texts("<p>{s.replace(/'/g, \"\")}</p>\n<!-- later -->\n<p>{/* later2 */}</p>", "astro"),
    ["<!-- later -->", "/* later2 */"],
  );
  assert.deepEqual(texts("---\nconst x = `\n---\n`;\n// hidden\n---\n<p/>", "astro"), ["// hidden"]);
  assert.deepEqual(texts("\uFEFF---\n// bom\n---\n<p/>", "astro"), ["// bom"]);
  assert.deepEqual(texts('<p>{xs.map((x) => "\'")}<code>/api</code></p>\n<!-- arrow -->', "astro"), ["<!-- arrow -->"]);
  assert.deepEqual(texts("<p>{a /* it's */ && b}</p>\n<!-- after -->", "astro"), ["/* it's */", "<!-- after -->"]);
});

test("Astro: frontmatter with templates, regexes, JSX and dashed comments", () => {
  assert.deepEqual(texts("---\nconst a = `x ${b} y`;\n// hidden\n---\n<p/>", "astro"), ["// hidden"]);
  assert.deepEqual(texts("---\nconst r = s.replace(/'/g, \"\");\n// hidden\n---\n<p/>", "astro"), ["// hidden"]);
  assert.deepEqual(texts("---\nconst el = <div>it's</div>;\n// hidden\n---\n<p/>", "astro"), ["// hidden"]);
  assert.deepEqual(
    texts("---\nconst a = 1;\n// --- section ---\nconst b = 2; // x\n---\n<p/>", "astro"),
    ["// --- section ---", "// x"],
  );
  assert.deepEqual(texts("<p>{x && <a>https://x.com</a>}</p>\n<!-- after -->", "astro"), ["<!-- after -->"]);
  assert.deepEqual(texts("<p class={/* attr */ x}>t</p>", "astro"), ["/* attr */"]);
  assert.deepEqual(texts("<p {...x /* spread */}>t</p>", "astro"), ["/* spread */"]);
  assert.deepEqual(texts("<p {x /* shorthand */}>t</p>", "astro"), ["/* shorthand */"]);
  assert.deepEqual(texts("<p a=`${x /* tpl */}`>t</p>", "astro"), ["/* tpl */"]);
  assert.deepEqual(texts("<p>x</p><!-- never", "astro"), ["<!-- never"]);
  assert.deepEqual(texts("<p>x</p>\n<!-- a\n<p>y</p>", "astro"), ["<!-- a\n<p>y</p>"]);
  assert.deepEqual(texts('---\nconst s = "<!--";\n---\n<p>x</p>', "astro"), []);
  assert.deepEqual(texts("<script>const s = '<!--';</script>\n<p>y</p>", "astro"), []);
  assert.deepEqual(texts('<p>{"<!--"}</p>\n<p>y</p>', "astro"), []);
  assert.deepEqual(texts("<textarea>a <!-- b --></textarea><title><!-- t --></title>", "astro"), []);
  assert.deepEqual(texts("<p>x</p><!-- a --!><p>y</p>", "astro"), ["<!-- a --!>"]);
  assert.deepEqual(texts("<p>x</p><!----><p>a</p><!--> after", "astro"), ["<!---->", "<!-->"]);
  assert.deepEqual(texts("<p>x</p><!x><p>y</p>", "astro"), ["<!x>"]);
  assert.deepEqual(texts("<div><p>x</p><!-- unclosed", "astro"), ["<!-- unclosed"]);
  assert.deepEqual(texts("<p>x <!-- unclosed", "astro"), ["<!-- unclosed"]);
  assert.deepEqual(texts("<!><p>y</p><!-- real -->", "astro"), ["<!>", "<!-- real -->"]);
  assert.deepEqual(texts("<abbr><!--a--></abbr><Header /><!--Header-->", "astro"), ["<!--a-->", "<!--Header-->"]);
  assert.deepEqual(texts("<p>x <!-- unclosed {y}", "astro"), ["<!-- unclosed {y}"]);
  assert.deepEqual(texts("<p>x <!-- unclosed {y} more", "astro"), ["<!-- unclosed {y} more"]);
  assert.deepEqual(texts("<!doctype html>\n<html><body><!-- real --></body></html>", "astro"), ["<!-- real -->"]);
  assert.deepEqual(texts('<div title="<!x>"></div><!-- real -->', "astro"), ["<!-- real -->"]);
  assert.deepEqual(texts("<p>a</p></3><!-- b -->", "astro"), ["</3>", "<!-- b -->"]);
  assert.deepEqual(texts("<>\n<p>a</p>\n</><!-- c -->", "astro"), ["<!-- c -->"]);
  assert.deepEqual(texts("<!DOCTYPE html>\n<html><body><!----></body></html>", "astro"), ["<!---->"]);
  assert.deepEqual(texts(`---\nconst s = "${"\u0130".repeat(30)}";\n---\n<!DOCTYPE html><!-- a --><p/>`, "astro"), ["<!-- a -->"]);
  assert.deepEqual(texts('<div title="<!x>"></div><!---->', "astro"), ["<!---->"]);
  assert.deepEqual(texts("<p>a</p><!-- unclosed {/* c */} more", "astro"), ["<!-- unclosed {/* c */} more"]);
  assert.deepEqual(texts("<p>a</p><svg><title>x <!-- y</title></svg>", "astro"), ["<!-- y</title></svg>"]);
  assert.deepEqual(texts("<p>a</p><iframe>x <!-- y</iframe>", "astro"), []);
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

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  Budget,
  clamp,
  COLOURS,
  type Identity,
  isMove,
  mint,
  originAllowed,
  roomKey,
  sessionSeed,
} from "./protocol.ts";

describe("roomKey", () => {
  test("normalises the shapes of the same page", () => {
    assert.equal(roomKey("/blog/first"), "/blog/first");
    assert.equal(roomKey("/blog/first/"), "/blog/first");
    assert.equal(roomKey("/blog/first///"), "/blog/first");
    assert.equal(roomKey("/BLOG/First"), "/blog/first");
  });

  test("treats the root as a room", () => {
    assert.equal(roomKey("/"), "/");
    assert.equal(roomKey("///"), "/");
  });

  /*
    Each distinct key is a Durable Object that can be brought into existence by
    asking for it, so this is the whole of what stops a stranger conjuring
    unbounded numbers of them.
  */
  test("refuses anything that is not a path on this site", () => {
    for (const bad of [
      null,
      "",
      "blog/first", // no leading slash
      "/blog/../../etc", // only via characters it already rejects, but be sure
      "/hello world",
      "/emoji-🎉",
      "/semi;colon",
      "/query?a=b",
      "/hash#frag",
      `/${"x".repeat(200)}`,
    ]) {
      assert.equal(
        roomKey(bad),
        null,
        `should have rejected ${JSON.stringify(bad)}`,
      );
    }
  });

  test("collapses repeated slashes to one room", () => {
    assert.equal(roomKey("//blog//first"), "/blog/first");
    assert.equal(roomKey("//"), "/");
  });

  test("allows the punctuation real paths use", () => {
    assert.equal(roomKey("/blog/a-post_name.v2"), "/blog/a-post_name.v2");
  });

  test("is idempotent", () => {
    const once = roomKey("/Blog/Thing/");
    assert.equal(roomKey(once), once);
  });
});

describe("originAllowed", () => {
  test("admits the site", () => {
    assert.equal(originAllowed("https://rcn.sh"), true);
  });

  test("admits local development", () => {
    assert.equal(originAllowed("http://localhost:4321"), true);
    assert.equal(originAllowed("http://127.0.0.1:4321"), true);
  });

  test("turns away everyone else", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example.com",
      "http://rcn.sh", // downgrade
      "https://rcn.sh.evil.example.com", // suffix trick
      "https://notrcn.sh",
      "https://localhost", // https localhost is not the dev server
      "not a url",
    ]) {
      assert.equal(
        originAllowed(bad),
        false,
        `should have refused ${JSON.stringify(bad)}`,
      );
    }
  });
});

describe("isMove", () => {
  test("accepts a position", () => {
    assert.equal(isMove({ t: "m", x: 0.5, y: 240 }), true);
    assert.equal(isMove({ t: "m", x: -1.2, y: -30 }), true);
  });

  /*
    NaN and Infinity both pass `typeof === "number"`. Either one would poison a
    cursor's position permanently, because every later frame interpolates from
    the last one — the peer would never be drawable again.
  */
  test("rejects numbers that are not numbers", () => {
    assert.equal(isMove({ t: "m", x: Number.NaN, y: 0 }), false);
    assert.equal(isMove({ t: "m", x: 0, y: Number.POSITIVE_INFINITY }), false);
    assert.equal(isMove({ t: "m", x: 0, y: Number.NEGATIVE_INFINITY }), false);
  });

  test("rejects everything that is not a position", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "m",
      [],
      {},
      { t: "m" },
      { t: "m", x: "0.5", y: 240 },
      { t: "bye", x: 0.5, y: 240 },
      { x: 0.5, y: 240 },
    ]) {
      assert.equal(
        isMove(bad),
        false,
        `should have rejected ${JSON.stringify(bad)}`,
      );
    }
  });
});

describe("clamp", () => {
  test("holds a wandering cursor inside the allowed range", () => {
    assert.equal(clamp(0.5, -1.5, 2.5), 0.5);
    assert.equal(clamp(-99, -1.5, 2.5), -1.5);
    assert.equal(clamp(99, -1.5, 2.5), 2.5);
  });
});

describe("Budget", () => {
  test("lets an ordinary client through untouched", () => {
    const budget = new Budget(90);
    for (let i = 0; i < 60; i++) {
      assert.equal(budget.spend(1, 1000), true, `dropped message ${i + 1}`);
    }
  });

  test("drops the excess once the second is spent", () => {
    const budget = new Budget(10);
    for (let i = 0; i < 10; i++) assert.equal(budget.spend(1, 1000), true);

    assert.equal(budget.spend(1, 1000), false);
    assert.equal(budget.spend(1, 1000), false);
  });

  test("the window rolls over", () => {
    const budget = new Budget(10);
    for (let i = 0; i < 20; i++) budget.spend(1, 1000);

    assert.equal(budget.spend(1, 1999), false, "still inside the window");
    assert.equal(budget.spend(1, 2000), true, "the window has closed");
  });

  test("one loud peer cannot spend another's allowance", () => {
    const budget = new Budget(5);
    for (let i = 0; i < 20; i++) budget.spend(1, 1000);

    assert.equal(budget.spend(2, 1000), true);
  });

  test("forgetting a peer releases its window", () => {
    const budget = new Budget(5);
    for (let i = 0; i < 20; i++) budget.spend(1, 1000);

    budget.forget(1);
    assert.equal(budget.spend(1, 1000), true);
  });
});

describe("mint", () => {
  const taken = (colours: string[]): Identity[] =>
    colours.map((colour, i) => ({ id: i + 1, name: "x", colour }));

  test("gives a colour nobody in the room is using", () => {
    const used = COLOURS.slice(0, COLOURS.length - 1).map(([, hex]) => hex);
    const only = COLOURS[COLOURS.length - 1][1];

    // Whatever the random draw, one colour is free and it must pick that one.
    for (const r of [0, 0.25, 0.5, 0.99]) {
      assert.equal(mint(taken(used), () => r).colour, only);
    }
  });

  test("falls back to the whole palette once it is exhausted", () => {
    const everything = COLOURS.map(([, hex]) => hex);
    const minted = mint(taken(everything), () => 0.5);

    assert.ok(everything.includes(minted.colour));
  });

  test("names the peer after its colour, so the label explains the arrow", () => {
    const minted = mint([], () => 0);
    const [word, hex] = COLOURS[0];

    assert.equal(minted.colour, hex);
    assert.ok(minted.name.startsWith(`${word} `), `got ${minted.name}`);
  });

  test("never collides with an id already in the room", () => {
    // A random source that would hand out a taken id first.
    let call = 0;
    const scripted = () => {
      call += 1;
      // colour pick, then id attempts: first repeats an existing id.
      return call === 1 ? 0 : call === 2 ? 41 / 0xff_ff_ff : 0.5;
    };
    const existing: Identity[] = [{ id: 42, name: "x", colour: "#000" }];

    assert.notEqual(mint(existing, scripted).id, 42);
  });

  test("ids are positive", () => {
    for (const r of [0, 0.5, 0.999999]) {
      assert.ok(mint([], () => r).id > 0);
    }
  });
});

describe("known rooms", () => {
  const known = new Set(["/", "/blog", "/blog/a-post"]);

  test("admits a page the site has", () => {
    assert.equal(roomKey("/blog/a-post", known), "/blog/a-post");
    assert.equal(roomKey("/Blog/A-Post/", known), "/blog/a-post");
    assert.equal(roomKey("/", known), "/");
  });

  /*
    The shape checks pass anything spelled like a path, which is every string a
    script cares to generate — and each distinct key it got through would be a
    Durable Object brought into existence by the asking. The Origin check in
    front of this only binds clients that choose to send an honest one.
  */
  test("refuses a path that is not a page, however well-formed", () => {
    for (const bad of ["/aaa", "/blog/not-a-post", "/blog/a-post/extra"]) {
      assert.equal(roomKey(bad, known), null, `should have refused ${bad}`);
    }
  });

  test("still checks the shape first", () => {
    assert.equal(roomKey("/hello world", known), null);
    assert.equal(roomKey(null, known), null);
  });

  test("checks shape alone when there is no list", () => {
    assert.equal(roomKey("/anything"), "/anything");
  });
});

describe("sessionSeed", () => {
  test("takes an opaque token", () => {
    assert.equal(sessionSeed("a1b2c3d4e5f60718"), "a1b2c3d4e5f60718");
  });

  test("refuses anything that is not one", () => {
    for (const bad of [null, "", "has-dashes", "has space", "*", `${"x".repeat(65)}`]) {
      assert.equal(
        sessionSeed(bad),
        null,
        `should have refused ${JSON.stringify(bad)}`,
      );
    }
  });
});

describe("mint, seeded", () => {
  const seed = "a1b2c3d4e5f60718";
  const other = "0f1e2d3c4b5a6978";

  /*
    The whole point. Identity used to be minted per socket, and the socket goes
    down on every idle timeout, tab switch and navigation — so one reader
    walking between posts arrived and left under a different name each time.
  */
  test("gives the same reader the same cursor every time", () => {
    const first = mint([], () => 0.1, seed);
    const again = mint([], () => 0.9, seed);

    assert.deepEqual(first, again);
  });

  test("gives different readers different ones", () => {
    assert.notEqual(mint([], Math.random, seed).name, mint([], Math.random, other).name);
  });

  test("gives way when the room already has that colour", () => {
    const wanted = mint([], Math.random, seed);
    const taken = [{ id: 999, name: "someone", colour: wanted.colour }];

    const minted = mint(taken, () => 0, seed);
    assert.notEqual(minted.colour, wanted.colour);
  });

  /*
    The label names the colour of the arrow it is attached to, so a cursor that
    had to change colour has to change its name with it — otherwise the amber
    fox is drawn in coral and the label is simply wrong.
  */
  test("the name follows the colour it settled on", () => {
    const wanted = mint([], Math.random, seed);
    const taken = [{ id: 999, name: "someone", colour: wanted.colour }];

    const minted = mint(taken, () => 0, seed);
    const [word] = COLOURS.find(([, hex]) => hex === minted.colour)!;

    assert.ok(minted.name.startsWith(`${word} `), `got ${minted.name}`);
  });

  test("the animal survives a change of colour", () => {
    const wanted = mint([], Math.random, seed);
    const taken = [{ id: 999, name: "someone", colour: wanted.colour }];

    const minted = mint(taken, () => 0, seed);
    assert.equal(minted.name.split(" ")[1], wanted.name.split(" ")[1]);
  });

  test("never collides with an id already in the room", () => {
    const wanted = mint([], Math.random, seed);
    const taken = [{ id: wanted.id, name: "someone", colour: "#000" }];

    assert.notEqual(mint(taken, () => 0.5, seed).id, wanted.id);
  });

  test("a room with no token behaves exactly as it did", () => {
    assert.equal(mint([], () => 0, null).colour, COLOURS[0][1]);
  });
});

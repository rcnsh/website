import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyDriver,
  groupSpan,
  homeStack,
  driverFact,
  linkHost,
  pluggedIn,
  position,
  thingCount,
  type UsesGroup,
} from "./uses.ts";

const groups: UsesGroup[] = [
  {
    title: "IRL",
    items: [
      { name: "Laptop", detail: '16", M5 Pro', art: "macbook" },
      { name: "Phone", art: "pixel" },
      { name: "Buds", art: "airpods" },
      { name: "Board", art: "keyboard" },
      { name: "Bag", art: "backpack" },
    ],
  },
  { title: "SOFTWARE", items: [{ name: "TS", url: "https://www.typescriptlang.org/", art: "typescript" }] },
];

test("the daily driver is the first physical thing", () => {
  assert.equal(dailyDriver(groups)?.name, "Laptop");
  assert.equal(dailyDriver([]), undefined);
});

test("the driver fact keeps the last part of its detail", () => {
  assert.equal(driverFact(groups[0].items[0]), "M5 Pro");
  assert.equal(driverFact({ name: "x", detail: "Solo", art: "x" }), "Solo");
  assert.equal(driverFact({ name: "x", art: "x" }), undefined);
});

test("plugged in is the peripherals after the driver, in data order", () => {
  assert.deepEqual(
    pluggedIn(groups).map((i) => i.name),
    ["Buds", "Board"],
  );
});

test("counts every item across groups", () => {
  assert.equal(thingCount(groups), 6);
});

test("position and host formatting", () => {
  assert.equal(position(2, 5), "03/05");
  assert.equal(linkHost("https://www.typescriptlang.org/docs"), "typescriptlang.org");
});

test("groups pair up narrow then wide, evenly when the same size", () => {
  const sized = (...counts: number[]): UsesGroup[] =>
    counts.map((n, i) => ({
      title: `G${i}`,
      items: Array.from({ length: n }, (_, j) => ({ name: `${i}.${j}`, art: "x" })),
    }));

  const uneven = sized(6, 9, 6, 4);
  assert.deepEqual([0, 1, 2, 3].map((i) => groupSpan(uneven, i)), [7, 5, 7, 12]);

  const even = sized(6, 9, 9, 4);
  assert.deepEqual([0, 1, 2, 3].map((i) => groupSpan(even, i)), [7, 6, 6, 12]);

  const closed = sized(6, 9, 6, 4, 4);
  assert.deepEqual([3, 4].map((i) => groupSpan(closed, i)), [6, 6]);
});

test("home stack puts primary items first, each set in /uses order", () => {
  const tagged: UsesGroup[] = [
    { title: "A", items: [
      { name: "Py", art: "x", home: "supporting" },
      { name: "TS", art: "x", home: "primary" },
      { name: "Off", art: "x" },
    ] },
    { title: "B", items: [{ name: "CF", art: "x", home: "primary" }] },
  ];
  assert.deepEqual(homeStack(tagged).map((i) => i.name), ["TS", "CF", "Py"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyDriver,
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

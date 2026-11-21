import { test } from "node:test";
import assert from "node:assert/strict";
import { containsProfanity } from "./profanity.ts";

const ALLOWED = [
  "",
  "Nice work, love the site!",
  "I ate a grape",
  "therapeutic massage",
  "great site, love the scrape tool",
  "the curtains drape nicely",
  "it happen is weird",
  "my analysis of the data",
  "the analyst said so",
  "hello from Scunthorpe",
  "fire retardant fabric",
  "assassin's creed fan",
  "let me assess that",
  "top of the class",
  "please bypass the cache",
  "a cocktail after work",
  "e. e. cummings is great",
  "Penistone is a real town",
  "the rapper is good",
  "Basque country trip",
  "compass and map",
  "this curry is spicy",
  "add cumin and spices",
  "he cocked his head",
  "a cocker spaniel",
  "the arsenal is full",
  "Dickens wrote it",
  "a prickle of hedgehogs",
];

const BLOCKED = [
  "this is shit",
  "what the fuck",
  "fucking hell",
  "that's shitty",
  "you bitch",
  "bitches everywhere",
  "pissed off",
  "what a wanker",
  "total bastard",
  "he got raped",
  "bullshit answer",
  "you dumbass",
  "motherfucker",
  "what a prick",
  "stop raping the changelog",
  "arsed about it",
];

test("lets ordinary messages through", () => {
  for (const message of ALLOWED) {
    assert.equal(
      containsProfanity(message),
      false,
      `should be allowed: ${JSON.stringify(message)}`,
    );
  }
});

test("catches plain profanity", () => {
  for (const message of BLOCKED) {
    assert.equal(
      containsProfanity(message),
      true,
      `should be blocked: ${JSON.stringify(message)}`,
    );
  }
});

test("sees through leetspeak", () => {
  assert.equal(containsProfanity("f4gg0t"), true);
  assert.equal(containsProfanity("sh1t"), true);
  assert.equal(containsProfanity("@ss"), true);
});

test("sees through stretched spellings", () => {
  assert.equal(containsProfanity("fuuuuck"), true);
  assert.equal(containsProfanity("shiiiiit"), true);
});

test("sees through padded-out spellings", () => {
  assert.equal(containsProfanity("f u c k"), true);
  assert.equal(containsProfanity("s-h-i-t"), true);
});

test("padding never glues separate words together", () => {
  assert.equal(containsProfanity("it happen is weird"), false);
  assert.equal(containsProfanity("epic until now"), false);
  assert.equal(containsProfanity("music until later"), false);
});

test("ignores accents and case", () => {
  assert.equal(containsProfanity("SHIT"), true);
  assert.equal(containsProfanity("shít"), true);
});

test("prefers blocking a slur over allowing its innocent homograph", () => {
  assert.equal(containsProfanity("a chink in the armour"), true);
});

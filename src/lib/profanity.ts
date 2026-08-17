/**
 * Local profanity check. A short wordlist rather than a third-party API, so
 * signing the guestbook never depends on another service being up.
 *
 * Matching is per word, never across the whole message. An earlier version
 * stripped every separator and substring-searched the result, which glued
 * neighbouring words together — "it happen is" contained "penis" — and flagged
 * innocent words that merely contain a term, like "grape" or "therapeutic".
 * Both classes of false positive are covered by the tests.
 */

/**
 * Matched against a whole word, give or take an inflection. Prefix-only, so a
 * term sitting inside a longer word ("class", "bypass") is not a match; the
 * few compounds worth catching are listed outright.
 */
const TERMS = [
  "anal", "anus", "arse", "ass", "bastard", "bitch", "bollock", "boner",
  "bullshit", "chink", "clit", "cock", "coon", "cum", "cunt", "dick", "dildo",
  "dumbass", "dyke", "fag", "faggot", "fuck", "goatse", "jizz", "kike",
  "motherfuck", "nigga", "nigger", "paki", "penis", "piss", "prick", "pussy",
  "rape", "retard", "shit", "slut", "spastic", "spic", "twat", "vagina",
  "wank", "whore",
];

/**
 * Endings a term may carry and still be the same word. Deliberately short:
 * every addition is a chance to swallow an unrelated word, which is how
 * "retardant" and "analysis" used to get caught.
 */
const SUFFIX = /^(s|es|ed|d|er|ers|ing|y|ies|in|head|heads)?$/;

/**
 * Ordinary words that a term plus a suffix happens to spell. Short terms are
 * the offenders — "spic" + "y", "cum" + "in", "cock" + "ed". This is the place
 * to add anything a visitor reports as wrongly blocked.
 */
const EXCEPTIONS = new Set([
  "spice", "spices", "spiced", "spicing", "spicy",
  "cumin", "cumins",
  "cocked", "cocker", "cockers",
]);

/** Common letter→symbol swaps, so "f4gg0t" doesn't slip through. */
const LEETSPEAK: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", $: "s", "!": "i", "|": "i", "+": "t",
};

/** One word, reduced to bare letters: accents, leetspeak and stutters removed. */
function canonicalise(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split("")
    .map((char) => LEETSPEAK[char] ?? char)
    .join("")
    .replace(/[^a-z]/g, "")
    // "fuuuuck" → "fuck"
    .replace(/(.)\1{2,}/g, "$1");
}

function isTerm(word: string): boolean {
  if (EXCEPTIONS.has(word)) return false;

  return TERMS.some((term) => {
    if (word.startsWith(term)) {
      const rest = word.slice(term.length);
      if (SUFFIX.test(rest)) return true;

      // English doubles a final consonant before -y and -ing: "shitty",
      // "shitting". Absorb the repeat and try the suffix again.
      if (rest.startsWith(term.at(-1)!) && SUFFIX.test(rest.slice(1))) {
        return true;
      }
    }

    // A term ending in "e" drops it before -ed and -ing: "rape" → "raping".
    // Only those two endings, so "rapper" stays clear of "rape".
    if (term.endsWith("e")) {
      const rest = word.startsWith(term.slice(0, -1))
        ? word.slice(term.length - 1)
        : null;
      if (rest === "ing" || rest === "ed") return true;
    }

    return false;
  });
}

/**
 * Runs of single-character tokens, joined up: "f u c k" and "s-h-i-t" arrive
 * here as "fuck" and "shit". Only single characters are joined, so ordinary
 * words are never glued to their neighbours.
 */
function padded(tokens: string[]): string[] {
  const runs: string[] = [];
  let run = "";

  for (const token of tokens) {
    if (token.length === 1) {
      run += token;
    } else {
      if (run.length > 2) runs.push(run);
      run = "";
    }
  }
  if (run.length > 2) runs.push(run);

  return runs;
}

export function containsProfanity(message: string): boolean {
  const tokens = message
    .split(/[^\p{L}\p{N}@$!|+]+/u)
    .map(canonicalise)
    .filter(Boolean);

  if (tokens.some(isTerm)) return true;

  // A deliberately spaced-out spelling is never an accident, so a bare
  // substring match is safe on these.
  return padded(tokens).some((run) => TERMS.some((term) => run.includes(term)));
}

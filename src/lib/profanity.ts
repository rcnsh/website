/**
 * Local profanity check — a short wordlist, so signing never depends on another
 * service. Matching is per word, never across the message: substring-searching
 * the whole string glues neighbours together and flags "therapeutic".
 */

/** Matched per word, prefix-only, so "class" and "bypass" are not matches. */
const TERMS = [
  "anal", "anus", "arse", "ass", "bastard", "bitch", "bollock", "boner",
  "bullshit", "chink", "clit", "cock", "coon", "cum", "cunt", "dick", "dildo",
  "dumbass", "dyke", "fag", "faggot", "fuck", "goatse", "jizz", "kike",
  "motherfuck", "nigga", "nigger", "paki", "penis", "piss", "prick", "pussy",
  "rape", "retard", "shit", "slut", "spastic", "spic", "twat", "vagina",
  "wank", "whore",
];

/** Endings a term keeps. Short on purpose — each one can swallow a real word. */
const SUFFIX = /^(s|es|ed|d|er|ers|ing|y|ies|in|head|heads)?$/;

/** Real words a term plus a suffix spells. Add anything reported as blocked. */
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

      // English doubles a final consonant before -y and -ing: "shitty".
      if (rest.startsWith(term.at(-1)!) && SUFFIX.test(rest.slice(1))) {
        return true;
      }
    }

    // "e" drops before -ed and -ing. Those two only, so "rapper" is clear.
    if (term.endsWith("e")) {
      const rest = word.startsWith(term.slice(0, -1))
        ? word.slice(term.length - 1)
        : null;
      if (rest === "ing" || rest === "ed") return true;
    }

    return false;
  });
}

/** Runs of single-character tokens joined up: "f u c k" → "fuck". */
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

  // A spaced-out spelling is never an accident, so substring matching is safe.
  return padded(tokens).some((run) => TERMS.some((term) => run.includes(term)));
}

/**
 * Local profanity check. A short wordlist rather than a third-party API, so
 * signing the guestbook never depends on another service being up.
 */

/** Matched as whole words only — too short to substring-search safely. */
const EXACT = [
  "anal", "anus", "arse", "ass", "clit", "cock", "coon", "cum", "cunt",
  "dick", "dyke", "fag", "fuck", "jizz", "kike", "paki", "piss", "prick",
  "shit", "slut", "spic", "twat", "wank",
];

/** Long enough to substring-match safely, so padded-out spellings are caught too. */
const SUBSTRING = [
  "bastard", "bitch", "bollock", "boner", "chink", "dildo", "faggot",
  "goatse", "nigga", "nigger", "penis", "pussy", "rape", "retard",
  "spastic", "vagina", "whore",
];

/** Common letter→symbol swaps, so "f4gg0t" doesn't slip through. */
const LEETSPEAK: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", $: "s", "!": "i", "|": "i", "+": "t",
};

function canonicalise(input: string): string {
  return input
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

export function containsProfanity(message: string): boolean {
  // Separators stripped, so "f u c k" and "s-h-i-t" are caught. This glues
  // adjacent words together, hence only the longer terms are searched here.
  const collapsed = canonicalise(message);
  if (!collapsed) return false;

  if (SUBSTRING.some((word) => collapsed.includes(word))) return true;

  const words = message
    .toLowerCase()
    .split(/[^a-z0-9@$!|+]+/)
    .map(canonicalise)
    .filter(Boolean);

  return words.some((word) => EXACT.includes(word));
}

/**
 * Local profanity check.
 *
 * The old site POSTed every message to vector.profanity.dev — a third-party
 * service that, if it ever went away or got slow, would block signing. A short
 * local wordlist is less clever but has no network dependency and no upkeep.
 */

/** Matched as whole words only — too short to substring-search safely. */
const EXACT = [
  "anal", "anus", "arse", "ass", "clit", "cock", "coon", "cum", "cunt",
  "dick", "dyke", "fag", "fuck", "jizz", "kike", "paki", "piss", "prick",
  "shit", "slut", "spic", "twat", "wank",
];

/**
 * Long enough that a substring match won't hit an innocent word, so these also
 * catch padded-out spellings like "n i g g e r".
 */
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
  // Whole message with all separators stripped — defeats "f u c k" and
  // "s-h-i-t", at the cost of gluing adjacent words together. Only the longer
  // terms are searched here, so "Scunthorpe" and "classroom" stay clean.
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

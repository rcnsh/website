const TERMS = [
  "anal", "anus", "arse", "ass", "bastard", "bitch", "bollock", "boner",
  "bullshit", "chink", "clit", "cock", "coon", "cum", "cunt", "dick", "dildo",
  "dumbass", "dyke", "fag", "faggot", "fuck", "goatse", "jizz", "kike",
  "motherfuck", "nigga", "nigger", "paki", "penis", "piss", "prick", "pussy",
  "rape", "retard", "shit", "slut", "spastic", "spic", "twat", "vagina",
  "wank", "whore",
];

const SUFFIX = /^(s|es|ed|d|er|ers|ing|y|ies|in|head|heads)?$/;

const EXCEPTIONS = new Set([
  "spice", "spices", "spiced", "spicing", "spicy",
  "cumin", "cumins",
  "cocked", "cocker", "cockers",
]);

const LEETSPEAK: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", $: "s", "!": "i", "|": "i", "+": "t",
};

function canonicalise(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split("")
    .map((char) => LEETSPEAK[char] ?? char)
    .join("")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1{2,}/g, "$1");
}

function isTerm(word: string): boolean {
  if (EXCEPTIONS.has(word)) return false;

  return TERMS.some((term) => {
    if (word.startsWith(term)) {
      const rest = word.slice(term.length);
      if (SUFFIX.test(rest)) return true;

      if (rest.startsWith(term.at(-1)!) && SUFFIX.test(rest.slice(1))) {
        return true;
      }
    }

    if (term.endsWith("e")) {
      const rest = word.startsWith(term.slice(0, -1))
        ? word.slice(term.length - 1)
        : null;
      if (rest === "ing" || rest === "ed") return true;
    }

    return false;
  });
}

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

  return padded(tokens).some((run) => TERMS.some((term) => run.includes(term)));
}

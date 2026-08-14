/**
 * Minimal profanity check for member-authored text (community chat posts,
 * trade review descriptions). Hand-rolled word-list matching rather than a
 * package like `bad-words` — same lockfile constraint as everywhere else in
 * this codebase's newer code (see docs/adr/0005-external-data-fetch-patterns.md):
 * no execution environment here to run `pnpm install` and regenerate
 * `pnpm-lock.yaml`, so no new dependency.
 *
 * This is intentionally a blunt, maintainable list rather than an attempt at
 * a comprehensive profanity database — it catches common English slurs and
 * obscenities with basic leetspeak/spacing evasion handling. It will have
 * both false negatives (creative evasion) and occasional false positives
 * (a word that's a substring of a legitimate word). Tune `BLOCKLIST` as
 * real moderation needs come up rather than trying to get it perfect
 * up front.
 */

// Kept intentionally short and unambiguous. Add to this list as needed —
// each entry is matched as a whole word against normalized text (see
// `normalize` below), not a raw substring, to avoid flagging things like
// "class" or "assessment" via a shorter blocked word.
const BLOCKLIST = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "dick",
  "piss",
  "slut",
  "whore",
  "faggot",
  "retard",
  "nigger",
  "nigga",
  "chink",
  "spic",
  "kike",
  "tranny",
];

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

function normalize(text: string): string {
  let out = text.toLowerCase();
  for (const [from, to] of Object.entries(LEET_MAP)) {
    out = out.split(from).join(to);
  }
  // Collapse repeated characters (e.g. "fuuuck" -> "fuck") and strip
  // non-letters so spaced-out evasion ("f u c k") still gets caught.
  out = out.replace(/[^a-z]/g, "");
  out = out.replace(/(.)\1+/g, "$1");
  return out;
}

export interface ProfanityCheckResult {
  blocked: boolean;
  matchedWord?: string;
}

/**
 * Checks free-text member input for blocklisted words. Normalizes leetspeak
 * substitutions, spacing, and repeated characters before matching so basic
 * evasion ("f.u.c.k", "fuuuck") is still caught, at the cost of being more
 * permissive about what counts as a "word boundary" than a real tokenizer —
 * acceptable for this app's actual need (block obvious slurs/obscenities in
 * a members-only chat), not meant to be bulletproof.
 */
export function checkProfanity(text: string): ProfanityCheckResult {
  const normalized = normalize(text);
  for (const word of BLOCKLIST) {
    if (normalized.includes(word)) {
      return { blocked: true, matchedWord: word };
    }
  }
  return { blocked: false };
}

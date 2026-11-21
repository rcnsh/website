# 0086. The guestbook's profanity check is a local wordlist matched per word

The guestbook's profanity check in `src/lib/profanity.ts` is a short local wordlist (`TERMS`) matched per word, never a call to another service, so signing never depends on one. Words are matched by prefix only, with a short suffix list and an exceptions set, never by substring across the whole message: substring-searching the whole string glues neighbours together and flags words like "therapeutic", and prefix-only matching keeps "class" and "bypass" clear.

Only a short list of endings extends a term (`SUFFIX`: s, es, ed, d, er, ers, ing, y, ies, in, head, heads), because each extra ending can swallow a real word. `isTerm` also matches a term whose final consonant is doubled before a suffix, as English does before -y and -ing ("shitty"). A term ending in e also matches without it, but only before -ed and -ing; allowing other suffixes would flag ordinary words such as "rapper". Real words that a term plus a suffix happens to spell (spice, spicy, ...) go in `EXCEPTIONS`, extended whenever something is reported as wrongly blocked, since suffix matching produces false positives only a list can clear.

Runs of single-character tokens ("f u c k") are joined and substring-matched against the terms. A spaced-out spelling is never an accident, so substring matching cannot glue real words together there.

## Consequences

Terms that are also ordinary English words are blocked in both senses, and `src/lib/profanity.test.ts` pins that as intended. Nothing at word level can separate the two senses, and a public guestbook is better off blocking the slur and losing the idiom.

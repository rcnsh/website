---
name: delete-comment
description: Purge code comments from a path or the whole repo, moving decisions into ADRs and filing issues for hacks.
disable-model-invocation: true
argument-hint: "[path ...]"
---

# Delete comments

Code in this repo carries no comments. `npm run lint:comments` (`scripts/comments.ts`) holds a ratchet in `comments-baseline.json`, a fingerprint of each comment still allowed. Any other comment fails, and so does a deleted one until `npm run lint:comments:update` drops it from the baseline. This skill pays down what the baseline still allows, for the paths given as arguments, or for every file in the baseline when there are none.

## 1. List

Run `node scripts/comments.ts list` and keep the entries under the target paths. Consecutive own-line comments form one **block**. The scanner reads GLSL inside shader template strings and `#` files (`_redirects`, `.gitignore`, `.dev.vars.example`) too, and skips tool directives (`@ts-expect-error`, `biome-ignore`, `/// <reference`, `@vite-ignore`, `/* glsl */`, `--> statement-breakpoint`). Leave those alone, and leave anything else a tool reads.

Done when you hold every block under the target, with file and line.

## 2. Categorise

Read the code around each block and give it exactly one category:

- **tautology**: it restates what the names, types or the next line already say.
- **stale**: it describes code, files or behaviour that no longer match. Confirm by grepping or reading.
- **excuse**: it justifies a hack that should be done properly: a "for now", a copied value kept in step by hand, a magic number with an apology, logic it admits is duplicated. A real platform constraint with no better option is a decision.
- **decision**: an important, non-obvious choice or constraint that the next person to change the code needs.

Done when every block has a category. For a decision, write down its reason with every concrete number, name and failure mode. For an excuse, write down what the code does now and what the proper fix looks like.

## 3. Delete

Delete every block, whatever its category. Change only comment text: a comment on its own line takes its line with it, a trailing comment leaves its code with the trailing space trimmed, and `{/* … */}` in a template goes with its braces. Leave no doubled blank line. A `biome-ignore` whose reason said "see above" gets a reason of its own. A generator that writes comments into its output (`scripts/generate-*.ts` templates) is edited too, or the next run puts them back.

Done when `node scripts/comments.ts list` shows nothing under the target.

## 4. Record

- **Decisions go to `docs/adr/`.** Search `docs/adr/README.md`'s index and `rg` the ADRs for the subsystem first. If an ADR already holds the decision, edit it to add what is new. Otherwise write the next number, following the README's format, and add it to the index. Several blocks stating one decision make one ADR.
- **Excuses become GitHub issues.** First check `gh issue list --label excuse --state open` for one already filed. Then file one per hack with `gh issue create --label excuse`: a Conventional Commit title, the hack, the fix, and the file and symbol. Link each issue to the thread.
- **Tautologies and stale comments** need nothing, apart from naming in your report any stale comment that pointed at a real bug.

## 5. Verify

Run `npm run lint:comments:update` (it only removes fingerprints; if it reports a comment it would not add, delete that comment), then `npm run lint`, `npm test` and `npx astro check`. Then run `npm run build` if `.dev.vars` and Cloudflare credentials are present: it is what proves no inline script's CSP hash moved. Done when all of them pass.

## 6. Report

Give the block count per category, the ADRs added or edited, the issues filed, the lines removed (`git diff --shortstat`), and what the baseline still allows (`node scripts/comments.ts stats`).

For more than about 200 blocks, split steps 1–3 across subagents by subsystem, one disjoint file list each, each writing its decisions and excuses to a JSON file. Then do step 4 yourself, so ADRs and issues are deduplicated in one place.

# 0171. The blog editor commits to main with a scoped token, guarded by GitHub's sha check

The on-site editor at `/blog/edit` reads and writes posts directly on `rcnsh/website`'s `main` branch through the GitHub Contents API (`src/lib/blog-repo.ts`). A commit to `main` is what publishes, because Workers Builds deploys every push to `main`, so no separate write path to the site is needed. A save ships whatever else is on `main` with it.

It authenticates with `BLOG_REPO_TOKEN`, a fine-grained token holding Contents: write on rcnsh/website and nothing else, so the token reaches no other repository or permission.

`POST /api/blog/post` takes `{ slug, sha, ...fields, body }`. A `sha` of `null` means create, and answers 409 if the file exists; otherwise `sha` must be the revision the editor loaded, and a mismatch answers 409. `writePostFile` sends that sha, or none for a new post, and maps GitHub's 409 and 422 to `PostConflictError`. GitHub refuses both a create over an existing file and an update from a stale sha, which gives optimistic concurrency that keeps two open editors from overwriting each other.

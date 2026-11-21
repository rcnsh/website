# 0163. Shell commands mimic their coreutils namesakes

The palette shell's commands in `src/lib/shell.ts` behave like their coreutils namesakes for the flags they accept and fail explicitly on anything unimplemented. A visitor who knows the real commands gets real behaviour rather than a guess. `shell.ts` runs in the browser, so it has no server imports and receives the filesystem as plain data from `src/lib/shell-fs.ts`.

File sizes are UTF-8 byte lengths, so `ls -l` and `wc -c` agree, as they do on a real system. `ls`, `sl`, `tree` and completion hide dot-entries unless asked, while `find` lists them, as the real tools do. That is the point of the `.egg` easter egg: hidden from a plain listing, still findable, which `src/lib/shell.test.ts` asserts.

The `sl` tests assert that its output equals `ls`'s reversed rather than listing expected names, so the fixture can grow without rewriting the test. The unknown-command test uses the nonsense name `frobnicate` and first asserts that it is not in `COMMANDS`, with a message saying to rename it. A well-known name can later be implemented, as `sl` was, and the guard then fails with an explanation rather than an inscrutable `false !== true`.

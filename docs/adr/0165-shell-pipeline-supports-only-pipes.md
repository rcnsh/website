# 0165. The shell supports only pipes, with globs passed as literal text

`run()` in `src/lib/shell.ts` tokenises with shell-quote, so quoting and escaping behave as in a real shell. It supports only `|`. Every other operator (redirects, `&&`, `;`) is refused with `sh: <op>: not supported`: redirects would need a writable filesystem, and this one is a read-only view of a website, and refusing rather than ignoring an operator avoids silently running something different from what was typed.

shell-quote hands back unquoted globs as `{ pattern }` objects for the shell to expand. There is no glob expansion here, so the pattern's text is passed to commands as a literal argument, which lets `find -name '*.md'` and grep patterns work.

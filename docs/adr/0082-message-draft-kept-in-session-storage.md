# 0082. The message draft survives a refused post in sessionStorage

The post/redirect/get round trip re-renders an empty form, so a refused post would lose the reader's text. `GuestbookForm.tsx` saves the draft to `sessionStorage` under `guestbook:draft` (`DRAFT_KEY`) on submit and restores it when the redirect reports a refusal.

A failure to save the draft is swallowed and the post proceeds. `sessionStorage` can throw on quota or in privacy mode, and the draft is a convenience that must not block signing.

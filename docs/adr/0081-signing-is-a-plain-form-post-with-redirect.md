# 0081. Signing and deleting are plain form posts that redirect back

`src/components/react/GuestbookForm.tsx` renders a normal `<form method="POST">` to `/api/guestbook/sign`. It works without JavaScript, and it lets the router submit it with `fetch` and swap in the page it lands on, so the site-wide player keeps playing. React only reports the remaining character count and adds a pending state.

`/api/guestbook/sign` answers with a 303 redirect to `/guestbook`, carrying `?posted` or `?error=<code>` and the fragment `#gb-sign`. Post/redirect/get means a reload or Back never re-submits, and the fragment brings the reader back to the form and its status line. `/api/guestbook/delete` redirects to `/guestbook` the same way.

A refused post answers 429 or 403, which is not HTML, so the router retries the action as a GET. Both routes therefore export a `GET`: the sign route's redirects to `/guestbook?error=refused#gb-sign`, landing on the form with an error so the draft is restored, and the delete route's redirects to `/guestbook`.

## Consequences

When the router is not running and the form posts natively, Back restores the page from the back-forward cache with the submit button stuck pending, so the form clears its pending state on a `pageshow` with `persisted`.

/**
 * Who is reading /guestbook. The page is prerendered and served alike to
 * everyone, so its form and delete buttons ask `/api/guestbook/signer` after
 * it loads. Free of server imports: the route takes only the types.
 */

export type Signer = {
  githubId: number;
  username: string;
  avatarUrl: string | null;
};

export type SignerView = {
  signer: Signer | null;
  /** Epoch ms when the signer may post again; null when they may post now. */
  nextPostAt: number | null;
};

let pending: Promise<SignerView> | null = null;

/**
 * One request per page shown, shared by the form and the list. Module state
 * outlives the page under the router, so a swap forgets the answer: the next
 * /guestbook may be the one a post redirected to, which changes it.
 */
export function loadSigner(): Promise<SignerView> {
  if (!pending) {
    const request = fetch("/api/guestbook/signer", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`signer lookup: ${response.status}`);
      return (await response.json()) as SignerView;
    });
    request.catch(() => {
      if (pending === request) pending = null;
    });
    pending = request;
  }
  return pending;
}

// Registered at import, so it runs before any island's own pageshow
// listener: back from the back-forward cache after a full load away (signing
// out, or in), the old answer may be someone else's.
if (typeof document !== "undefined") {
  document.addEventListener("astro:before-swap", () => {
    pending = null;
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) pending = null;
  });
}

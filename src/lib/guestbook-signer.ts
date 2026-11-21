export type Signer = {
  githubId: number;
  username: string;
  avatarUrl: string | null;
};

export type SignerView = {
  signer: Signer | null;
  nextPostAt: number | null;
};

let pending: Promise<SignerView> | null = null;

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

if (typeof document !== "undefined") {
  document.addEventListener("astro:before-swap", () => {
    pending = null;
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) pending = null;
  });
}

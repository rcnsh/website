import { useEffect, useState } from "react";
import { loadSigner, type SignerView } from "@/lib/guestbook-signer";

/**
 * Who is reading /guestbook: null while asking. Asks again when the page
 * comes back from the back-forward cache, which may follow a sign-out.
 */
export function useSigner(): SignerView | "failed" | null {
  const [view, setView] = useState<SignerView | "failed" | null>(null);
  useEffect(() => {
    let live = true;
    const ask = () => {
      loadSigner().then(
        (answer) => live && setView(answer),
        () => live && setView("failed"),
      );
    };
    const again = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setView(null);
      ask();
    };
    ask();
    addEventListener("pageshow", again);
    return () => {
      live = false;
      removeEventListener("pageshow", again);
    };
  }, []);
  return view;
}

export const MOTION_BOOTSTRAP = `
      (() => {
        const apply = () => {
          try {
            const stored = localStorage.getItem("rcn:motion");
            const reduce =
              stored === "reduce" ||
              (stored !== "full" &&
                matchMedia("(prefers-reduced-motion: reduce)").matches);
            document.documentElement.dataset.motion = reduce ? "reduce" : "full";
          } catch {
            // Storage is walled off. Leaving the attribute unset is what hands
            // the decision back to the media query in global.css.
          }
        };

        apply();
      })();
    `;

export const INLINE_SCRIPTS = [MOTION_BOOTSTRAP];

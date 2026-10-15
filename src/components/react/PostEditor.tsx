import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/post-slug";

type Post = {
  slug: string;
  /** Null for a post not yet on GitHub. */
  sha: string | null;
  title: string;
  description: string;
  pubDate: string;
  updatedDate: string | null;
  draft: boolean;
  body: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; commitUrl: string }
  | { kind: "error"; message: string };

const field =
  "w-full rounded-[6px] border border-line-soft bg-base px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand";
const label = "label mb-1.5 block";

export default function PostEditor({ initial }: { initial: Post }) {
  const [post, setPost] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(initial.sha !== null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const form = useRef<HTMLFormElement>(null);
  const isNew = post.sha === null;

  const update = (patch: Partial<Post>) => {
    setPost((current) => {
      const next = { ...current, ...patch };
      if (isNew && !slugTouched && patch.title !== undefined) next.slug = slugify(patch.title);
      return next;
    });
    setDirty(true);
    if (status.kind !== "saving") setStatus({ kind: "idle" });
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", save);
    return () => window.removeEventListener("keydown", save);
  }, []);

  async function save() {
    if (status.kind === "saving") return;
    setStatus({ kind: "saving" });

    try {
      const response = await fetch("/api/blog/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(post),
      });
      const result = (await response.json().catch(() => ({}))) as {
        sha?: string;
        commitUrl?: string;
        error?: string;
      };

      if (!response.ok || !result.sha) {
        setStatus({ kind: "error", message: result.error ?? `Save failed (${response.status})` });
        return;
      }

      setPost((current) => ({ ...current, sha: result.sha ?? null }));
      setSlugTouched(true);
      setDirty(false);
      setStatus({ kind: "saved", commitUrl: result.commitUrl ?? "" });
      if (isNew) history.replaceState(null, "", `/blog/edit?post=${encodeURIComponent(post.slug)}`);
    } catch {
      setStatus({ kind: "error", message: "Network error. Nothing was saved." });
    }
  }

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <label className={label} htmlFor="pe-title">Title</label>
          <input
            id="pe-title"
            required
            maxLength={200}
            value={post.title}
            onChange={(e) => update({ title: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="pe-slug">Slug</label>
          <input
            id="pe-slug"
            required
            readOnly={!isNew}
            pattern="_?[a-z0-9]+(-[a-z0-9]+)*"
            value={post.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update({ slug: e.target.value });
            }}
            title={isNew ? "Lowercase letters, digits and single hyphens" : "The URL of a published post stays put"}
            className={cn(field, "font-mono text-[0.84375rem]", !isNew && "text-ink-faint")}
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="pe-description">Description</label>
        <input
          id="pe-description"
          required
          maxLength={500}
          value={post.description}
          onChange={(e) => update({ description: e.target.value })}
          className={field}
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className={label} htmlFor="pe-pub">Published</label>
          <input
            id="pe-pub"
            type="date"
            required
            value={post.pubDate}
            onChange={(e) => update({ pubDate: e.target.value })}
            className={cn(field, "w-auto font-mono text-[0.84375rem]")}
          />
        </div>
        <div>
          <label className={label} htmlFor="pe-updated">Updated</label>
          <input
            id="pe-updated"
            type="date"
            value={post.updatedDate ?? ""}
            onChange={(e) => update({ updatedDate: e.target.value || null })}
            className={cn(field, "w-auto font-mono text-[0.84375rem]")}
          />
        </div>
        <label className="flex h-[38px] items-center gap-2 font-mono text-[0.8125rem] text-ink-dim">
          <input
            type="checkbox"
            checked={post.draft}
            onChange={(e) => update({ draft: e.target.checked })}
            className="accent-(--color-brand)"
          />
          Draft
        </label>
      </div>

      <div>
        <label className={label} htmlFor="pe-body">Markdown</label>
        <textarea
          id="pe-body"
          value={post.body}
          onChange={(e) => update({ body: e.target.value })}
          spellCheck
          rows={28}
          className={cn(field, "min-h-[60vh] resize-y font-mono text-[0.8125rem] leading-[1.7]")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3.5">
        <button
          type="submit"
          disabled={status.kind === "saving"}
          className="inline-flex h-[34px] shrink-0 items-center rounded-[6px] border border-ink bg-ink px-3.5 text-[0.84375rem] font-medium text-(color:--color-base) transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-ink"
        >
          {status.kind === "saving" ? "Committing…" : isNew ? "Create post" : "Save"}
        </button>
        <span className="font-mono text-[11px] text-ink-faint">
          commits to main · live after the deploy (~2 min)
        </span>

        <p role="status" className="basis-full text-[0.84375rem] sm:ml-auto sm:basis-auto">
          {status.kind === "error" && <span className="text-bad">{status.message}</span>}
          {status.kind === "saved" && (
            <span className="text-ok">
              Committed
              {status.commitUrl && (
                <>
                  {" · "}
                  <a href={status.commitUrl} className="underline underline-offset-[3px]">
                    view on GitHub
                  </a>
                </>
              )}
              {!post.draft && (
                <>
                  {" · "}
                  <a href={`/blog/${post.slug}`} className="underline underline-offset-[3px]">
                    open post
                  </a>
                </>
              )}
            </span>
          )}
          {status.kind === "idle" && dirty && <span className="text-ink-faint">Unsaved changes</span>}
        </p>
      </div>
    </form>
  );
}

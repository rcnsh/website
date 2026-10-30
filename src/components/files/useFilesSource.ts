import { useEffect, useState, useSyncExternalStore } from "react";
import { createFilesSource, type FilesSource, type FilesSourceOptions, type FilesView } from "@/lib/files-source";
import { publishOwnerTree, settleOwnerHold } from "./owner-view";

type Props = Pick<FilesSourceOptions, "tree" | "initial" | "bucketUrl">;

/** The browser's listings, with the owner upgrade started on mount. */
export function useFilesSource({ tree, initial, bucketUrl }: Props): [FilesView, FilesSource] {
  const [source] = useState(() =>
    createFilesSource({
      tree,
      initial,
      bucketUrl,
      fetch: (input, init) => fetch(input, init),
      publish: publishOwnerTree,
      onSettled: settleOwnerHold,
    }),
  );
  const view = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  // No teardown: the store unsubscribes on unmount, and a remount (StrictMode,
  // fast refresh) reuses this source, so disposing it would freeze the view.
  useEffect(() => {
    void source.checkAccess();
  }, [source]);
  return [view, source];
}

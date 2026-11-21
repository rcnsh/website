import { useEffect, useState, useSyncExternalStore } from "react";
import { createFilesSource, type FilesSource, type FilesSourceOptions, type FilesView } from "@/lib/files-source";
import { ownerViewForVisit } from "./owner-view";

type Props = Pick<FilesSourceOptions, "tree" | "initial" | "bucketUrl">;

export function useFilesSource({ tree, initial, bucketUrl }: Props): [FilesView, FilesSource] {
  const [source] = useState(() =>
    createFilesSource({
      tree,
      initial,
      bucketUrl,
      fetch: (input, init) => fetch(input, init),
      ...ownerViewForVisit(),
    }),
  );
  const view = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  useEffect(() => {
    void source.checkAccess();
  }, [source]);
  return [view, source];
}

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@shared/lib/query-keys.constant";
import {
  getDocumentPage,
  getObject,
  type DocumentFilters,
} from "../../api/object-pages.api";
export function useDocumentPages(
  projectId: string,
  filters: DocumentFilters,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: QueryKeys.objectPages(projectId, filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      getDocumentPage(projectId, filters, pageParam, signal),
    getNextPageParam: (lastPage, _pages, lastParam, params) =>
      lastPage.nextCursor &&
      lastPage.nextCursor !== lastParam &&
      !params.includes(lastPage.nextCursor)
        ? lastPage.nextCursor
        : undefined,
    enabled: !!projectId && enabled,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    placeholderData: (previous, query) =>
      query?.queryKey[1] === projectId &&
      (query.queryKey[3] as DocumentFilters | undefined)?.kind === filters.kind
        ? previous
        : undefined,
  });
}
export function useObject(projectId: string, id: string, enabled = true) {
  return useQuery({
    queryKey: QueryKeys.object(projectId, id),
    queryFn: ({ signal }) => getObject(projectId, id, signal),
    enabled: !!projectId && !!id && enabled,
    staleTime: 60000,
  });
}

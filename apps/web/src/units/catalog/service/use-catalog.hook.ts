import { useSearch, useNavigate, useParams } from "@tanstack/react-router";
import { useDebouncedCallback } from "@mantine/hooks";
import { useState, useEffect, useRef } from "react";
import type { CatalogFilters } from "../model/search.schema";
export function useCatalogFilters() {
  const filters = useSearch({ from: "/projects/$projectId/$section" });
  const params = useParams({ from: "/projects/$projectId/$section" });
  const navigate = useNavigate({ from: "/projects/$projectId/$section" });
  const [searchInput, setSearchInput] = useState(filters.q);
  const pendingCommit = useRef<string | null>(null);
  const context = JSON.stringify([
    params.projectId,
    params.section,
    filters.tag,
    filters.variant,
    filters.palette,
    filters.flow,
    filters.status,
    filters.archived,
    filters.kind,
    filters.frame,
    filters.selected,
  ]);
  const previousContext = useRef(context);
  const navigateFilters = (patch: Partial<CatalogFilters>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: !("selected" in patch),
    });
  const debounced = useDebouncedCallback((q: string) => {
    pendingCommit.current = q;
    navigateFilters({ q });
  }, 300);
  useEffect(() => {
    // A committed debounce acknowledges our own input; external navigation replaces it.
    const ownCommit =
      previousContext.current === context &&
      pendingCommit.current === filters.q;
    previousContext.current = context;
    pendingCommit.current = null;
    if (!ownCommit) {
      debounced.cancel();
      setSearchInput(filters.q);
    }
  }, [filters.q, context, debounced]);
  const update = (patch: Partial<CatalogFilters>) => {
    if ("q" in patch) {
      debounced.cancel();
      pendingCommit.current = null;
      setSearchInput(patch.q ?? "");
    }
    navigateFilters(patch);
  };
  return {
    filters,
    searchInput,
    clearSearch: () => {
      debounced.cancel();
      pendingCommit.current = null;
      setSearchInput("");
    },
    setSearch: (q: string) => {
      setSearchInput(q);
      debounced(q);
    },
    update,
    select: (selected: string) => update({ selected }),
  };
}

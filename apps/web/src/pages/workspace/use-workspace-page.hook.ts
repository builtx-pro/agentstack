import { tagFilter, tagSection } from "@units/catalog/lib/tag-filter.util";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { WorkspaceService } from "@units/workspace";
import { AuthService } from "@units/auth";
import { useCatalogFilters } from "@units/catalog/service/use-catalog.hook";
import type { ObjectKind, ProjectObject } from "@shared/api/schemas";
import { sectionInfo, type Section } from "@shared/lib/labels.constant";
export function useWorkspacePage() {
  const params = useParams({ from: "/projects/$projectId/$section" });
  const projectId = params.projectId;
  const section = (
    params.section in sectionInfo ? params.section : "overview"
  ) as Section;
  const navigate = useNavigate();
  const auth = AuthService.useAuth();
  const project = WorkspaceService.useProject(projectId, !!auth.data);
  const projects = WorkspaceService.useProjects(!!auth.data);
  const { filters, select } = useCatalogFilters();
  const documents = section === "documents";
  const canEdit =
    !!auth.data?.user.isAdmin ||
    project.data?.role === "developer" ||
    project.data?.role === "admin";
  const documentKind = filters.kind === "rule" && canEdit ? "rule" : "document";
  const fullObjects = WorkspaceService.useObjects(
    projectId,
    !!auth.data && !documents,
  );
  const documentPages = WorkspaceService.useDocumentPages(
    projectId,
    {
      kind: documentKind,
      q: filters.q,
      tag: filters.tag,
      status: filters.status,
      archived: filters.archived,
    },
    !!auth.data && !!project.data && documents,
  );
  const documentItems = useMemo(
    () => documentPages.data?.pages.flatMap((page) => page.items),
    [documentPages.data],
  );
  const objects = {
    data: documents ? documentItems : fullObjects.data,
    isPending: documents ? documentPages.isPending : fullObjects.isPending,
    error: documents
      ? documentPages.isFetchNextPageError
        ? null
        : documentPages.error
      : fullObjects.error,
    refetch: documents ? documentPages.refetch : fullObjects.refetch,
  };
  const selectedDetail = WorkspaceService.useObject(
    projectId,
    filters.selected,
    !!auth.data && documents,
  );
  const notes = WorkspaceService.useNotes(
    projectId,
    undefined,
    !!auth.data && !documents,
  );
  const progress = WorkspaceService.useProgress(
    projectId,
    !!auth.data && !documents,
  );
  const [editor, setEditor] = useState<{
    kind: ObjectKind;
    object?: ProjectObject;
  } | null>(null);
  const selected = documents
    ? (selectedDetail.data ??
      objects.data?.find((object) => object.id === filters.selected))
    : objects.data?.find((object) => object.id === filters.selected);
  const goSection = (next: string) =>
    void navigate({
      to: "/projects/$projectId/$section",
      params: { projectId, section: next },
      search: {
        q: "",
        tag: "",
        variant: "",
        palette: "",
        flow: "",
        status: "",
        kind: "",
        archived: false,
        selected: "",
      },
    });
  const filterTag = (tag: string, object: ProjectObject) =>
    void navigate({
      to: "/projects/$projectId/$section",
      params: { projectId, section: tagSection(object.kind) },
      search: {
        ...tagFilter(tag, object.kind, object.archived),
        ...(object.kind === "rule" ? { kind: "rule" } : {}),
      },
    });
  const documentPagination = {
    hasMore: documentPages.hasNextPage,
    fetching: documentPages.isFetchingNextPage,
    refreshing: documentPages.isFetching && !documentPages.isFetchingNextPage,
    stale: documentPages.isPlaceholderData,
    error: documentPages.isFetchNextPageError ? documentPages.error : null,
    load: () => {
      void documentPages.fetchNextPage();
    },
    retry: () => {
      void (documentPages.isFetchNextPageError
        ? documentPages.fetchNextPage()
        : documentPages.refetch());
    },
  };
  return {
    filterTag,
    projectId,
    section,
    auth,
    project,
    projects,
    objects,
    notes,
    progress,
    filters,
    select,
    selected,
    selectedPending:
      documents && !!filters.selected && selectedDetail.isPending,
    selectedError: selectedDetail.error,
    selectedRetry: selectedDetail.refetch,
    documentPagination,
    canEdit,
    editor,
    setEditor,
    goSection,
  };
}

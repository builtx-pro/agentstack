import { request } from "@shared/api/client";
import { listSchema, objectSchema } from "@shared/api/schemas";
export interface DocumentFilters {
  kind: "document" | "rule";
  q: string;
  tag: string;
  status: string;
  archived: boolean;
}
export async function getDocumentPage(
  projectId: string,
  filters: DocumentFilters,
  cursor: string | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    kind: filters.kind,
    q: filters.q,
    tag: filters.tag,
    status: filters.status,
    archived: String(filters.archived),
    limit: "30",
  });
  if (cursor) params.set("cursor", cursor);
  return request(
    `/projects/${encodeURIComponent(projectId)}/objects?${params}`,
    listSchema(objectSchema),
    { signal },
  );
}
export const getObject = (
  projectId: string,
  id: string,
  signal?: AbortSignal,
) =>
  request(
    `/projects/${encodeURIComponent(projectId)}/objects/${encodeURIComponent(id)}`,
    objectSchema,
    { signal },
  );

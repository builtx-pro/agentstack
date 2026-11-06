import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { objectSchema, type ProjectObject } from "@shared/api/schemas";
import { QueryKeys } from "@shared/lib/query-keys.constant";
import { request } from "@shared/api/client";
interface WorkspaceWrite {
  path: string;
  method?: string;
  body?: unknown;
}
export async function reconcileWorkspace(
  client: QueryClient,
  projectId: string,
  write: WorkspaceWrite,
  result: unknown,
) {
  const base = `/projects/${projectId}`;
  const path = write.path.split("?")[0] ?? "";
  const refresh = (key: QueryKey, exact = false) =>
    client.invalidateQueries({ queryKey: key, exact });
  const activity = () => refresh(QueryKeys.activity(projectId));
  const notesKey = [...QueryKeys.project(projectId), "notes"];
  if (path === `${base}/notes` || path.startsWith(`${base}/notes/`)) {
    await Promise.all([
      refresh(notesKey),
      refresh(QueryKeys.progress(projectId)),
      activity(),
    ]);
    return;
  }
  if (path === `${base}/objects` || path.startsWith(`${base}/objects/`)) {
    const saved = objectSchema.safeParse(result);
    const upsert = (object: ProjectObject) => {
      if (object.projectId !== projectId) return;
      client.setQueryData<ProjectObject[]>(
        QueryKeys.objects(projectId),
        (previous) => {
          if (!previous) return previous;
          const existing = previous.find((item) => item.id === object.id);
          if (existing && existing.version > object.version) return previous;
          return existing
            ? previous.map((item) => (item.id === object.id ? object : item))
            : [...previous, object];
        },
      );
    };
    if (saved.success) {
      upsert(saved.data);
      client.setQueryData<ProjectObject>(
        QueryKeys.object(projectId, saved.data.id),
        (previous) =>
          previous && previous.version > saved.data.version
            ? previous
            : saved.data,
      );
    } else await refresh(QueryKeys.objects(projectId));
    const targetId = path.slice(`${base}/objects/`.length).split("/")[0];
    if (path.endsWith("/convert") && targetId) {
      const proposal = await request(
        `${base}/objects/${encodeURIComponent(targetId)}`,
        objectSchema,
      );
      upsert(proposal);
    }
    await Promise.all([
      refresh(QueryKeys.objectPages(projectId)),
      refresh([...QueryKeys.project(projectId), "object"]),
      refresh([...QueryKeys.project(projectId), "history"]),
      refresh(notesKey),
      refresh(QueryKeys.progress(projectId)),
      activity(),
    ]);
    return;
  }
  if (path === `${base}/import`) {
    await refresh(QueryKeys.project(projectId));
    return;
  }
  const section = path.startsWith(`${base}/`)
    ? path.slice(base.length + 1).split("/")[0]
    : undefined;
  if (section && ["tokens", "members", "invitations"].includes(section)) {
    await Promise.all([
      refresh(QueryKeys.settings(projectId, section)),
      activity(),
      ...(section === "members"
        ? [
            refresh(QueryKeys.project(projectId), true),
            refresh(QueryKeys.projects()),
          ]
        : []),
    ]);
    return;
  }
  if (path === "/users" || path.startsWith("/users/")) {
    await Promise.all([
      client.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "project" &&
          query.queryKey[2] === "settings" &&
          query.queryKey[3] === "users",
      }),
      activity(),
    ]);
    return;
  }
  if (path === base || path === "/projects") {
    await Promise.all([
      refresh(QueryKeys.project(projectId), true),
      refresh(QueryKeys.projects()),
      activity(),
      refresh(QueryKeys.settings(projectId, "project-history")),
    ]);
    return;
  }
  await refresh(QueryKeys.project(projectId));
}

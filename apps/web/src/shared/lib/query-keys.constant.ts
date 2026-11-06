export const QueryKeys = {
  auth: () => ["auth"] as const,
  projects: () => ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  objectPages: (id: string, filters?: object) =>
    ["project", id, "object-pages", ...(filters ? [filters] : [])] as const,
  object: (id: string, target: string) =>
    ["project", id, "object", target] as const,
  objects: (id: string) => ["project", id, "objects"] as const,
  notes: (id: string, target?: string) =>
    ["project", id, "notes", target ?? "all"] as const,
  history: (id: string, target: string) =>
    ["project", id, "history", target] as const,
  progress: (id: string) => ["project", id, "progress"] as const,
  activity: (id: string) => ["project", id, "activity"] as const,
  settings: (id: string, section: string) =>
    ["project", id, "settings", section] as const,
};

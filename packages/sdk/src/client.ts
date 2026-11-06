import { z } from "zod";
import { ApiTransport } from "./transport.client.js";
import { AgentStackError } from "./errors.errors.js";
import { retryRateLimitedUpload } from "./upload-retry.util.js";
import * as S from "./schemas.schema.js";
import * as R from "./repository.schema.js";
import * as T from "./task.schema.js";
import type {
  ClientOptions,
  RequestOptions,
  PageOptions,
  ObjectFilters,
  NoteFilters,
} from "./client.types.js";

function query(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.size ? `?${params}` : "";
}
function projectPath(projectId: string): string {
  return `/projects/${S.idSchema.parse(projectId)}`;
}
function targetPath(projectId: string, objectId: string): string {
  return `${projectPath(projectId)}/objects/${S.idSchema.parse(objectId)}`;
}
export class AgentStackClient {
  readonly transport: ApiTransport;
  constructor(options: ClientOptions) {
    this.transport = new ApiTransport(options);
  }
  /** Human session only. Project-scoped tokens cannot read a personal board. */
  tasks(filters: Partial<T.TaskListQuery> = {}, options?: RequestOptions) {
    T.taskListQuerySchema.parse(filters);
    return this.transport.request("GET", `/tasks${query(filters)}`, S.pageSchema(T.taskItemSchema), undefined, options);
  }
  personalTask(id: string, options?: RequestOptions) {
    return this.transport.request("GET", `/tasks/${S.idSchema.parse(id)}`, T.taskItemSchema, undefined, options);
  }
  createPersonalTask(draft: z.input<typeof T.personalTaskDraftSchema>, options?: RequestOptions) {
    return this.transport.request("POST", "/tasks", T.taskItemSchema, T.personalTaskDraftSchema.parse(draft), options);
  }
  updatePersonalTask(id: string, patch: T.PersonalTaskPatch, options?: RequestOptions) {
    return this.transport.request("PATCH", `/tasks/${S.idSchema.parse(id)}`, T.taskItemSchema, T.personalTaskPatchSchema.parse(patch), options);
  }
  personalTaskHistory(id: string, filters: PageOptions = {}, options?: RequestOptions) {
    T.taskHistoryQuerySchema.parse(filters);
    return this.transport.request("GET", `/tasks/${S.idSchema.parse(id)}/history${query(filters)}`, S.pageSchema(T.taskHistoryEntrySchema), undefined, options);
  }
  capabilities(options?: RequestOptions) {
    return this.transport.request(
      "GET",
      "/capabilities",
      S.capabilitiesSchema,
      undefined,
      options,
    );
  }
  ready(options?: RequestOptions) {
    return this.transport.request(
      "GET",
      "/ready",
      z.object({ status: z.literal("ready"), schemaVersion: z.number().int() }),
      undefined,
      options,
    );
  }
  projects(filters: PageOptions = {}, options?: RequestOptions) {
    return this.transport.request(
      "GET",
      `/projects${query(filters)}`,
      S.pageSchema(S.projectSchema),
      undefined,
      options,
    );
  }
  project(projectId: string, options?: RequestOptions) {
    return this.transport.request(
      "GET",
      projectPath(projectId),
      S.projectSchema,
      undefined,
      options,
    );
  }
  objects(
    projectId: string,
    filters: ObjectFilters = {},
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/objects${query(filters)}`,
      S.pageSchema(S.objectSchema),
      undefined,
      options,
    );
  }
  repositories(projectId: string, options?: RequestOptions) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/repositories`,
      S.pageSchema(R.repositorySchema),
      undefined,
      options,
    );
  }
  repository(
    projectId: string,
    connectionId: string,
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/repositories/${S.idSchema.parse(connectionId)}`,
      R.repositorySchema,
      undefined,
      options,
    );
  }
  repositoryPipelines(projectId: string, options?: RequestOptions) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/repositories/pipelines`,
      S.pageSchema(R.repositoryPipelineGroupSchema),
      undefined,
      options,
    );
  }
  repositorySnapshots(
    projectId: string,
    connectionId: string,
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/repositories/${S.idSchema.parse(connectionId)}/snapshots`,
      S.pageSchema(R.repositorySnapshotSummarySchema),
      undefined,
      options,
    );
  }
  repositorySnapshot(
    projectId: string,
    connectionId: string,
    snapshotId: string,
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/repositories/${S.idSchema.parse(connectionId)}/snapshots/${S.idSchema.parse(snapshotId)}`,
      R.repositorySnapshotSchema,
      undefined,
      options,
    );
  }
  refreshRepository(
    projectId: string,
    connectionId: string,
    expectedVersion: number,
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "POST",
      `${projectPath(projectId)}/repositories/${S.idSchema.parse(connectionId)}/refresh`,
      R.repositorySnapshotSchema,
      { expectedVersion: S.versionSchema.parse(expectedVersion) },
      options,
    );
  }
  stageRepositorySnapshot(
    projectId: string,
    connectionId: string,
    snapshot: R.RepositorySnapshotInput,
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "POST",
      `${projectPath(projectId)}/repositories/${S.idSchema.parse(connectionId)}/snapshots`,
      R.repositorySnapshotSchema,
      R.repositorySnapshotInputSchema.parse(snapshot),
      options,
    );
  }
  object(projectId: string, objectId: string, options?: RequestOptions) {
    return this.transport.request(
      "GET",
      targetPath(projectId, objectId),
      S.objectSchema,
      undefined,
      options,
    );
  }
  createObject(
    projectId: string,
    draft: S.ObjectDraft,
    options: RequestOptions = {},
  ) {
    return this.transport.request(
      "POST",
      `${projectPath(projectId)}/objects`,
      S.objectSchema,
      S.objectDraftSchema.parse(draft),
      {
        ...options,
        idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
      },
    );
  }
  updateObject(
    projectId: string,
    objectId: string,
    patch: S.ObjectPatch,
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "PATCH",
      targetPath(projectId, objectId),
      S.objectSchema,
      S.objectPatchSchema.parse(patch),
      options,
    );
  }
  history(
    projectId: string,
    objectId: string,
    filters: PageOptions = {},
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "GET",
      `${targetPath(projectId, objectId)}/history${query(filters)}`,
      S.pageSchema(S.historySchema),
      undefined,
      options,
    );
  }
  notes(
    projectId: string,
    filters: NoteFilters = {},
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/notes${query(filters)}`,
      S.pageSchema(S.noteSchema),
      undefined,
      options,
    );
  }
  createNote(
    projectId: string,
    draft: S.NoteDraft,
    options: RequestOptions = {},
  ) {
    return this.transport.request(
      "POST",
      `${projectPath(projectId)}/notes`,
      S.noteSchema,
      S.noteDraftSchema.parse(draft),
      {
        ...options,
        idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
      },
    );
  }
  transition(
    projectId: string,
    noteId: string,
    transition: S.Transition,
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "POST",
      `${projectPath(projectId)}/notes/${S.idSchema.parse(noteId)}/transition`,
      S.noteSchema,
      S.transitionSchema.parse(transition),
      options,
    );
  }
  noteHistory(
    projectId: string,
    noteId: string,
    filters: PageOptions = {},
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/notes/${S.idSchema.parse(noteId)}/history${query(filters)}`,
      S.pageSchema(S.historySchema),
      undefined,
      options,
    );
  }
  progress(projectId: string, options?: RequestOptions) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/progress`,
      S.progressSchema,
      undefined,
      options,
    );
  }
  context(projectId: string, options?: RequestOptions) {
    return this.transport.request(
      "GET",
      `${projectPath(projectId)}/context`,
      S.contextSchema,
      undefined,
      options,
    );
  }
  uploadFile(
    projectId: string,
    file: Blob,
    name: string,
    options?: RequestOptions,
  ) {
    if (file.size > 12 * 1024 * 1024 || !file.size)
      throw new Error("Files must be nonempty and at most 12 MiB.");
    const form = new FormData();
    form.set("file", file, name);
    return retryRateLimitedUpload(
      () =>
        this.transport.request(
          "POST",
          `${projectPath(projectId)}/files`,
          S.fileSchema,
          form,
          options,
        ),
      options?.signal,
    );
  }
  importManifest(
    projectId: string,
    manifest: S.Manifest,
    dryRun = true,
    options?: RequestOptions,
  ) {
    return this.transport.request(
      "POST",
      `${projectPath(projectId)}/import`,
      S.importReportSchema,
      {
        manifest: {
          ...S.manifestSchema.parse(manifest),
          files: manifest.files.map(({ path: _path, ...metadata }) => metadata),
        },
        dryRun,
      },
      options,
    );
  }
  async collect<T>(
    fetchPage: (cursor?: string) => Promise<S.Page<T>>,
    { maxPages = 100 }: { maxPages?: number } = {},
  ): Promise<T[]> {
    z.number().int().min(1).max(1000).parse(maxPages);
    const items: T[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const result = await fetchPage(cursor);
      items.push(...result.items);
      if (!result.nextCursor) return items;
      if (cursors.has(result.nextCursor))
        throw new AgentStackError("pagination_cycle");
      cursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
    throw new AgentStackError("pagination_limit");
  }
}

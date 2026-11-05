import {
  pipelineSchema,
  type Pipeline,
  type Repository,
} from "@agentstack/contracts";
import { AppError } from "../shared/errors.js";
import { repositoryPathAllowed } from "./repository-parser.service.js";
export type RepositoryFetch = typeof fetch;
export function validateRepository(provider: string, repository: string) {
  const parts = repository.split("/");
  if (
    parts.some(
      (p) => !/^[A-Za-z0-9_.-]+$/.test(p) || p === "." || p === "..",
    ) ||
    (provider === "github" && parts.length !== 2) ||
    (provider === "gitlab" && parts.length < 2) ||
    (provider === "local" && parts.length !== 1)
  )
    throw new AppError(
      400,
      "invalid_repository",
      "Use owner/repository for GitHub, group/repository for GitLab, or a local identifier.",
    );
}
const sha = (v: unknown): string => {
  if (typeof v !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(v))
    throw new AppError(
      502,
      "repository_response_invalid",
      "Provider returned an invalid commit.",
    );
  return v;
};
export async function fetchRepository(
  connection: Repository,
  token: string | undefined,
  fetcher: RepositoryFetch = fetch,
) {
  validateRepository(connection.provider, connection.repository);
  if (connection.provider === "local")
    throw new AppError(
      422,
      "repository_local",
      "Stage local repositories with the CLI or CI connector.",
    );
  const controller = new AbortController();
  const total = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(60000),
  ]);
  let bytes = 0;
  const utf8 = (value: Uint8Array) => {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(value);
    } catch {
      throw new AppError(
        502,
        "repository_response_invalid",
        "Provider content must be valid UTF-8.",
      );
    }
  };
  const pipeline = (value: unknown): Pipeline => {
    const parsed = pipelineSchema.safeParse(value);
    if (!parsed.success)
      throw new AppError(
        502,
        "repository_response_invalid",
        "Provider returned an invalid pipeline summary.",
      );
    return parsed.data;
  };
  async function request(
    path: string,
    limit = 8 * 1024 * 1024,
    raw = false,
  ): Promise<any> {
    const origin =
      connection.provider === "github"
        ? "https://api.github.com"
        : "https://gitlab.com/api/v4";
    let response: Response;
    try {
      response = await fetcher(origin + path, {
        redirect: "error",
        signal: AbortSignal.any([total, AbortSignal.timeout(15000)]),
        headers: {
          Accept: "application/json",
          ...(connection.provider === "github"
            ? { "X-GitHub-Api-Version": "2026-03-10" }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      throw new AppError(
        502,
        "repository_unavailable",
        "Repository provider did not respond within the allowed time.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? "repository_rate_limited"
          : "repository_provider_error",
        "Provider rejected the request. Check repository access, read permissions and rate limits.",
      );
    }
    const reader = response.body?.getReader();
    if (!reader)
      throw new AppError(
        502,
        "repository_response_invalid",
        "Empty provider response.",
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new AppError(
            413,
            "repository_too_large",
            "Provider response exceeds the safe size limit. Narrow the configured roots.",
          );
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        "repository_unavailable",
        "Provider response was interrupted.",
      );
    } finally {
      reader.releaseLock();
    }
    const content = utf8(Buffer.concat(chunks));
    if (raw) return content;
    try {
      return JSON.parse(content);
    } catch {
      throw new AppError(
        502,
        "repository_response_invalid",
        "Invalid provider JSON.",
      );
    }
  }
  const repo = connection.repository
      .split("/")
      .map(encodeURIComponent)
      .join("/"),
    branch = encodeURIComponent(connection.branch);
  let commit: string,
    tree: Array<{ path: string; sha: string; size?: number }> = [],
    pipelines: Pipeline[] = [];
  if (connection.provider === "github") {
    const head = await request(`/repos/${repo}/commits/${branch}`);
    commit = sha(head.sha);
    const result = await request(
      `/repos/${repo}/git/trees/${sha(head.commit?.tree?.sha)}?recursive=1`,
    );
    if (
      result.truncated ||
      !Array.isArray(result.tree) ||
      result.tree.length > 50000
    )
      throw new AppError(
        413,
        "repository_tree_incomplete",
        "Repository tree is too large to import safely.",
      );
    tree = result.tree
      .filter(
        (v: any) =>
          v.type === "blob" &&
          v.mode !== "120000" &&
          repositoryPathAllowed(v.path, connection.roots),
      )
      .map((v: any) => ({ path: v.path, sha: sha(v.sha), size: v.size }));
    const runs = await request(
      `/repos/${repo}/actions/runs?branch=${branch}&per_page=20`,
    );
    if (!Array.isArray(runs.workflow_runs))
      throw new AppError(
        502,
        "repository_response_invalid",
        "Invalid workflow response.",
      );
    pipelines = runs.workflow_runs.slice(0, 20).map((r: any) =>
      pipeline({
        id: String(r.id),
        name: r.name ?? "Workflow",
        status:
          r.status === "in_progress"
            ? "running"
            : r.status !== "completed"
              ? "queued"
              : ((
                  {
                    success: "passed",
                    failure: "failed",
                    cancelled: "cancelled",
                    skipped: "skipped",
                    timed_out: "failed",
                    action_required: "failed",
                  } as Record<string, string>
                )[r.conclusion] ?? "unknown"),
        commit: sha(r.head_sha),
        url: r.html_url,
        updatedAt: r.updated_at,
        source: "provider",
      }),
    );
  } else {
    const prefix = `/projects/${encodeURIComponent(connection.repository)}`;
    const head = await request(`${prefix}/repository/commits/${branch}`);
    commit = sha(head.id);
    let count = 0;
    for (let page = 1; page <= 500; page++) {
      const rows = await request(
        `${prefix}/repository/tree?ref=${commit}&recursive=true&per_page=100&page=${page}`,
      );
      if (!Array.isArray(rows))
        throw new AppError(
          502,
          "repository_response_invalid",
          "Invalid repository tree.",
        );
      count += rows.length;
      if (count > 50000)
        throw new AppError(
          413,
          "repository_tree_incomplete",
          "Repository tree exceeds the safe limit.",
        );
      tree.push(
        ...rows
          .filter(
            (v: any) =>
              v.type === "blob" &&
              v.mode !== "120000" &&
              repositoryPathAllowed(v.path, connection.roots),
          )
          .map((v: any) => ({ path: v.path, sha: sha(v.id) })),
      );
      if (rows.length < 100) break;
      if (page === 500)
        throw new AppError(
          413,
          "repository_tree_incomplete",
          "Repository tree exceeds the safe limit.",
        );
    }
    const runs = await request(`${prefix}/pipelines?ref=${branch}&per_page=20`);
    if (!Array.isArray(runs))
      throw new AppError(
        502,
        "repository_response_invalid",
        "Invalid pipeline response.",
      );
    pipelines = runs.slice(0, 20).map((r: any) =>
      pipeline({
        id: String(r.id),
        name: `Pipeline #${r.iid ?? r.id}`,
        status:
          (
            {
              created: "queued",
              waiting_for_resource: "queued",
              preparing: "queued",
              pending: "queued",
              running: "running",
              success: "passed",
              failed: "failed",
              canceled: "cancelled",
              skipped: "skipped",
              manual: "queued",
              scheduled: "queued",
            } as Record<string, string>
          )[r.status] ?? "unknown",
        commit: sha(r.sha),
        url: r.web_url,
        updatedAt: r.updated_at ?? r.created_at,
        source: "provider",
      }),
    );
  }
  if (!tree.length)
    throw new AppError(
      422,
      "repository_empty",
      "No Markdown documents were found in the configured roots.",
    );
  if (tree.length > 200)
    throw new AppError(
      413,
      "repository_too_large",
      "At most 200 Markdown files can be imported. Narrow the configured roots.",
    );
  const files: Array<{ path: string; content: string }> = [];
  let index = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, tree.length) }, async () => {
        while (index < tree.length) {
          total.throwIfAborted();
          const item = tree[index++]!;
          if (item.size !== undefined && item.size > 131072)
            throw new AppError(
              413,
              "repository_too_large",
              "Markdown file exceeds 128 KiB.",
            );
          let content: string;
          if (connection.provider === "github") {
            const blob = await request(
              `/repos/${repo}/git/blobs/${item.sha}`,
              256 * 1024,
            );
            if (blob.encoding !== "base64" || typeof blob.content !== "string")
              throw new AppError(
                502,
                "repository_response_invalid",
                "Unsupported provider blob.",
              );
            const encoded = blob.content.replace(/\s/g, "");
            if (
              !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                encoded,
              )
            )
              throw new AppError(
                502,
                "repository_response_invalid",
                "Invalid provider blob encoding.",
              );
            content = utf8(Buffer.from(encoded, "base64"));
          } else
            content = await request(
              `/projects/${encodeURIComponent(connection.repository)}/repository/blobs/${item.sha}/raw`,
              131072,
              true,
            );
          bytes += Buffer.byteLength(content);
          if (Buffer.byteLength(content) > 131072 || bytes > 4 * 1024 * 1024)
            throw new AppError(
              413,
              "repository_too_large",
              "Repository content exceeds import limits. Narrow the configured roots.",
            );
          files.push({ path: item.path, content });
        }
      }),
    );
  } catch (error) {
    controller.abort();
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      "repository_unavailable",
      "Repository synchronization was interrupted.",
    );
  }
  return {
    expectedVersion: connection.version,
    branch: connection.branch,
    commit,
    files,
    pipelines,
  };
}

import { describe, expect, it } from "vitest";
import { AgentStackClient } from "./client.js";
const projectId = "11111111-1111-4111-8111-111111111111";
const context = {
  project: { id: projectId, name: "Synthetic project", slug: "synthetic" },
  capabilities: {
    version: "0.1.0",
    apiVersion: 1,
    objectKinds: ["rule"],
    features: ["context"],
    mcpTransport: "stdio",
  },
  rules: [],
  documents: [],
  planning: [],
  notes: [],
  activeClaims: [{id:projectId,projectId,targetId:projectId,targetVersion:1,body:'Synthetic active review',authorName:'Synthetic author',visibility:'team',status:'in_progress',version:2,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',claimedRuleRevisions:[{id:projectId,version:3}]}],
  truncated: { rules: true, documents: false, planning: true, notes: false },
  nextNoteCursor: null,
  nextCursors: {
    rules: "rules-cursor",
    documents: null,
    planning: "planning-cursor",
    notes: null,
    activeClaims: "claim-cursor",
  },
  continuations: {
    rules: {
      path: `/projects/${projectId}/objects`,
      query: {
        kind: "rule",
        archived: "false",
        cursor: "rules-cursor",
        limit: 100,
      },
    },
    planning: {
      path: `/projects/${projectId}/objects`,
      query: { archived: "false", cursor: "planning-cursor", limit: 100 },
      filterKinds: ["wave", "epic", "story", "sprint", "feature", "proposal"],
    },
  },
  omittedObjects: [
    {
      id: projectId,
      key: "large-rule",
      kind: "rule",
      title: "Large rule",
      version: 2,
      path: `/projects/${projectId}/objects/${projectId}`,
      reason: "context_budget",
    },
  ],
  contextBudget: { maxBytes: 1048576, usedBytes: 2048, complete: false },
};

describe("budgeted project context", () => {
  it("preserves continuation and omission metadata instead of silently stripping it", async () => {
    const client = new AgentStackClient({
      baseUrl: "http://127.0.0.1:4300",
      token: "synthetic-token",
      fetch: async () => Response.json(context),
    });
    const result = await client.context(projectId);
    expect(result).toMatchObject({
      activeClaims: context.activeClaims,
      nextCursors: context.nextCursors,
      continuations: context.continuations,
      omittedObjects: context.omittedObjects,
      contextBudget: context.contextBudget,
    });
  });
});

import { describe, it, expect } from "vitest";
import { parseRepositoryFiles } from "../src/repositories/repository-parser.service.js";
const id = "11111111-1111-4111-8111-111111111111";
describe("repository Markdown import", () => {
  it("maps hierarchy/status/checklists and preserves complete work item Markdown", () => {
    const drafts = parseRepositoryFiles(
      id,
      ["epics", "docs"],
      [
        {
          path: "epics/epic-a/epic.md",
          content:
            "---\nid: EPIC-A\ntitle: Recovery\nstatus: in-progress\nmilestone: M1\n---\n# Full epic\n\nDetails",
        },
        {
          path: "epics/epic-a/story.md",
          content:
            "---\nid: STORY-A\nepic: EPIC-A\ntitle: Recover account\nstatus: review\nblocked: true\npriority: must\n---\n# Recovery\n\n- [x] Request code\n- [ ] Check code",
        },
        { path: "docs/guide.md", content: "# Operator guide\n\nInstructions" },
      ],
    );
    const epic = drafts.find((x) => x.key === "EPIC-A")!,
      story = drafts.find((x) => x.key === "STORY-A")!;
    expect(epic.draft.status).toBe("in_progress");
    expect(story.draft.kind).toBe("story");
    expect(story.draft.data.epicId).toBe(`repo:${id}:EPIC-A`);
    expect(story.draft.data.blocked).toBe(true);
    expect(
      (story.draft.data.checklist as { done: boolean }[]).map((x) => x.done),
    ).toEqual([true, false]);
    expect(
      drafts.find((x) => x.key === "STORY-A:document")?.draft.data.markdown,
    ).toContain("Check code");
    expect(drafts.find((x) => x.key === "wave:M1")?.draft.kind).toBe("wave");
  });
  it("rejects traversal/outside roots, duplicate IDs and YAML aliases", () => {
    for (const path of [
      "../secret.md",
      "docs/../secret.md",
      "elsewhere/doc.md",
    ])
      expect(() =>
        parseRepositoryFiles(id, ["docs"], [{ path, content: "# No" }]),
      ).toThrow();
    expect(() =>
      parseRepositoryFiles(
        id,
        ["docs"],
        [
          { path: "docs/a.md", content: "---\nid: SAME\n---\n# A" },
          { path: "docs/b.md", content: "---\nid: SAME\n---\n# B" },
        ],
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseRepositoryFiles(
        id,
        ["docs"],
        [{ path: "docs/a.md", content: "---\nid: &x A\ntitle: *x\n---\n# A" }],
      ),
    ).toThrow();
  });
  it("stages rules team-only for subsequent human approval", () => {
    const [rule] = parseRepositoryFiles(
      id,
      ["AGENTS.md"],
      [
        {
          path: "AGENTS.md",
          content: "---\nvisibility: customer\n---\n# Agent rules",
        },
      ],
    );
    expect(rule?.draft.kind).toBe("rule");
    expect(rule?.draft.visibility).toBe("team");
  });
});

it("accepts the maximum parser output in a single apply request", async () => {
  const { repositoryApplySchema } = await import("@agentstack/contracts");
  const drafts = parseRepositoryFiles(
    id,
    ["epics"],
    Array.from({ length: 200 }, (_, i) => ({
      path: `epics/${i}.md`,
      content: `---\nid: EPIC-${i}\nmilestone: M${i}\n---\n# Epic ${i}`,
    })),
  );
  expect(drafts).toHaveLength(600);
  expect(
    repositoryApplySchema.safeParse({
      expectedVersion: 1,
      entries: drafts.map((d) => ({ key: d.key, expectedObjectVersion: null })),
    }).success,
  ).toBe(true);
  expect(
    repositoryApplySchema.safeParse({
      expectedVersion: 1,
      entries: Array.from({ length: 601 }, (_, i) => ({
        key: `item-${i}`,
        expectedObjectVersion: null,
      })),
    }).success,
  ).toBe(false);
});

it("keeps ADR lifecycle vocabulary separate from strict delivery statuses", () => {
  for (const status of ["accepted", "proposed"]) {
    const [document] = parseRepositoryFiles(
      id,
      ["docs"],
      [
        {
          path: `docs/adr-${status}.md`,
          content: `---\nstatus: ${status}\n---\n# Decision\n\nPreserve the reasoning.`,
        },
      ],
    );
    expect(document?.draft.status).toBe("backlog");
    expect(document?.draft.data.markdown).toBe(
      "# Decision\n\nPreserve the reasoning.",
    );
  }
  expect(() =>
    parseRepositoryFiles(
      id,
      ["epics"],
      [
        {
          path: "epics/invalid.md",
          content:
            "---\nid: EPIC-INVALID\nstatus: accepted\n---\n# Wrong status",
        },
      ],
    ),
  ).toThrow("Unsupported work item status");
});

it("uses stable safe keys for human-readable milestone names", () => {
  const drafts = parseRepositoryFiles(
    id,
    ["epics"],
    [
      {
        path: "epics/a.md",
        content: "---\nid: EPIC-A\nmilestone: Launch phase 1\n---\n# Epic",
      },
    ],
  );
  const wave = drafts.find((d) => d.draft.kind === "wave")!;
  expect(wave.draft.title).toBe("Launch phase 1");
  expect(wave.draft.key).not.toContain(" ");
  expect(drafts.find((d) => d.draft.kind === "epic")?.draft.data.waveId).toBe(
    wave.draft.key,
  );
});

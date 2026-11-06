import { describe, it, expect } from "vitest";
import { groupTasks, storyTask } from "./task-board.util";
import type { ProjectObject } from "@shared/api/schemas";
describe("task boards", () => {
  it("preserves distinct project/private IDs and all five columns", () => {
    const rows = [
      { id: "a", status: "ready" },
      { id: "a", status: "done" },
    ];
    const columns = groupTasks(rows);
    expect(columns.map((x) => x.status)).toEqual([
      "backlog",
      "ready",
      "in_progress",
      "review",
      "done",
    ]);
    expect(columns[1]?.items).toEqual([rows[0]]);
    expect(columns[4]?.items).toEqual([rows[1]]);
  });
  it("normalizes missing optional story fields without inventing completion", () => {
    const story = {
      id: "one",
      projectId: "p",
      title: "Real work",
      description: "",
      tags: [],
      version: 2,
      status: "review",
      archived: false,
      data: { checklist: [{ id: "x", text: "Check", done: true }] },
      createdAt: "now",
      updatedAt: "now",
    } as unknown as ProjectObject;
    const task = storyTask(story, "Project");
    expect(task.source).toBe("project");
    expect(task.status).toBe("review");
    expect(task.priority).toBe("normal");
    expect(task.blocked).toBe(false);
    expect(task.checklist[0]?.done).toBe(true);
  });
});

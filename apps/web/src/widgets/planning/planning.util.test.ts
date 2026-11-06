import { describe, it, expect } from "vitest";
import {
  planningChildren,
  planningRoots,
  planningSummary,
} from "./planning.util";
import type { ProjectObject } from "@shared/api/schemas";
const item = (
  id: string,
  kind: ProjectObject["kind"],
  data: ProjectObject["data"] = {},
  status: ProjectObject["status"] = "ready",
  archived = false,
): ProjectObject => ({
  id,
  kind,
  data,
  status,
  archived,
  projectId: "p",
  key: id,
  title: id,
  description: "",
  tags: [],
  visibility: "team",
  version: 1,
  createdAt: "2026-11-06",
  updatedAt: "2026-11-06",
});
const objects = [
  item("wave", "wave"),
  item("epic", "epic", { waveId: "wave" }),
  item("sprint", "sprint"),
  item("story", "story", { epicId: "epic", sprintId: "sprint" }, "done"),
  item("loose", "story"),
  item("old", "story", { epicId: "epic" }, "done", true),
];
describe("planning hierarchy", () => {
  it("orders milestone names naturally instead of by database UUID",()=>{expect(planningRoots([item("M10","wave"),item("M2","wave"),item("M1","wave")]).map(o=>o.title)).toEqual(["M1","M2","M10"]);});
  it("places linked work under parents without duplicating roots", () => {
    expect(planningRoots(objects).map((o) => o.id)).toEqual([
      "wave",
      "sprint",
      "loose",
    ]);
    expect(planningChildren(objects[0]!, objects).map((o) => o.id)).toEqual([
      "epic",
    ]);
    expect(planningChildren(objects[1]!, objects).map((o) => o.id)).toEqual([
      "story",
    ]);
    expect(planningChildren(objects[2]!, objects).map((o) => o.id)).toEqual([
      "story",
    ]);
  });
  it("counts unique active stories and exposes empty scope honestly", () => {
    expect(planningSummary(objects[0]!, objects)).toEqual({
      done: 1,
      total: 1,
      blocked: 0,
      percent: 100,
    });
    expect(planningSummary(item("empty", "wave"), objects)).toEqual({
      done: 0,
      total: 0,
      blocked: 0,
      percent: 0,
    });
  });
  it("keeps orphans visible when parents are unavailable", () => {
    expect(planningRoots([objects[1]!, objects[3]!]).map((o) => o.id)).toEqual([
      "epic",
    ]);
  });
});

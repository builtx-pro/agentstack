import { describe, it, expect } from "vitest";
import {
  filterObjects,
  groupByFlow,
  replaceChecklistLine,
} from "./catalog.util";
import type { ProjectObject } from "@shared/api/schemas";
const obj = (
  id: string,
  data: Record<string, unknown> = {},
  other: Partial<ProjectObject> = {},
): ProjectObject => ({
  id,
  projectId: "p",
  key: id,
  kind: "screen",
  title: id,
  description: "",
  tags: [],
  visibility: "customer",
  status: "ready",
  archived: false,
  version: 1,
  data,
  createdAt: "2026-11-05",
  updatedAt: "2026-11-05",
  ...other,
});
describe("catalog review filters", () => {
  it("does not mix variants or include archived objects by default", () => {
    expect(
      filterObjects(
        [
          obj("a", { variant: "E" }),
          obj("b", { variant: "J" }),
          obj("c", { variant: "E" }, { archived: true }),
        ],
        { q: "", variant: "E", tag: "", status: "", archived: false },
      ),
    ).toHaveLength(1);
  });
  it("finds Russian е/ё and all query words across title and tags", () => {
    expect(
      filterObjects(
        [obj("a", {}, { title: "Трёхмерный образ", tags: ["вечер"] })],
        {
          q: "трехмерный вечер",
          variant: "",
          tag: "",
          status: "",
          archived: false,
        },
      ),
    ).toHaveLength(1);
  });
  it("uses ordered IDs without duplicating screen outside its flow", () => {
    const screens = [obj("a"), obj("b")];
    expect(
      groupByFlow(screens, [
        obj("flow", { screenIds: ["b", "a"] }, { kind: "flow" }),
      ])[0].screens.map((x) => x.id),
    ).toEqual(["b", "a"]);
  });
  it("updates only the specified markdown checkbox", () => {
    expect(replaceChecklistLine("- [ ] first\n- [x] second", 0, true)).toBe(
      "- [x] first\n- [x] second",
    );
  });
});

it("filters desktop screens and treats legacy screens as mobile", () => {
  const objects = [
    obj("legacy"),
    obj("phone", { frame: "mobile" }),
    obj("web", { frame: "desktop" }),
  ];
  const f = { q: "", variant: "", tag: "", status: "", archived: false };
  expect(
    filterObjects(objects, { ...f, frame: "mobile" }).map((o) => o.id),
  ).toEqual(["legacy", "phone"]);
  expect(
    filterObjects(objects, { ...f, frame: "desktop" }).map((o) => o.id),
  ).toEqual(["web"]);
});

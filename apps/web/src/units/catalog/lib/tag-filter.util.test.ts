import { describe, it, expect } from "vitest";
import { tagFilter, tagSection } from "./tag-filter.util";
describe("tag navigation", () => {
  it("opens all matching screen variants in a clean grid and closes the viewer", () => {
    expect(tagFilter("recovery", "screen", false)).toEqual({
      frame: "",
      tag: "recovery",
      q: "",
      flow: "",
      status: "",
      kind: "",
      selected: "",
      mode: "grid",
      variant: "__all",
      palette: "__all",
      archived: false,
    });
  });
  it("keeps archived items discoverable and routes other targets to their library", () => {
    expect(tagFilter("art", "asset", true).archived).toBe(true);
    expect(tagFilter("art", "asset", true).variant).toBe("");
    expect(tagSection("flow")).toBe("screens");
    expect(tagSection("asset")).toBe("assets");
    expect(tagSection("rule")).toBe("documents");
    expect(tagSection("proposal")).toBe("features");
    expect(tagSection("epic")).toBe("plan");
  });
});

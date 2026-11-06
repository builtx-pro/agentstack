import type { ProjectObject, ChecklistItem } from "@shared/api/schemas";
import { asStrings, asString } from "@shared/lib/format.util";
const normalize = (value: string) =>
  value.toLocaleLowerCase().replaceAll("ё", "е");
export function filterObjects(
  objects: ProjectObject[],
  filters: {
    q: string;
    variant: string;
    tag: string;
    status: string;
    archived: boolean;
    palette?: string;
    kind?: string;
    frame?: string;
  },
) {
  const words = normalize(filters.q).split(/\s+/).filter(Boolean);
  return objects.filter(
    (o) =>
      o.archived === filters.archived &&
      (!filters.frame ||
        o.kind !== "screen" ||
        (o.data.frame === "desktop" ? "desktop" : "mobile") ===
          filters.frame) &&
      (!filters.variant ||
        asString(o.data.variant) ===
          (filters.variant === "__default" ? "" : filters.variant)) &&
      (!filters.palette ||
        asString(o.data.palette) ===
          (filters.palette === "__default" ? "" : filters.palette)) &&
      (!filters.tag || o.tags.includes(filters.tag)) &&
      (!filters.status || o.status === filters.status) &&
      (!filters.kind || o.kind === filters.kind) &&
      words.every((word) =>
        normalize(
          [o.title, o.key, o.description, ...o.tags].join(" "),
        ).includes(word),
      ),
  );
}
export function groupByFlow(screens: ProjectObject[], flows: ProjectObject[]) {
  return flows.map((flow) => ({
    flow,
    screens: asStrings(flow.data.screenIds)
      .map((id) => screens.find((s) => s.id === id))
      .filter((o): o is ProjectObject => !!o),
  }));
}
export function replaceChecklistLine(
  markdown: string,
  index: number,
  done: boolean,
) {
  let current = -1;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*[-*] \[[ xX]\]/.test(line)) {
        current++;
        if (current === index)
          return line.replace(/\[[ xX]\]/, done ? "[x]" : "[ ]");
      }
      return line;
    })
    .join("\n");
}
export function readChecklist(data: Record<string, unknown>): ChecklistItem[] {
  return Array.isArray(data.checklist)
    ? data.checklist
        .filter(
          (x): x is ChecklistItem =>
            !!x &&
            typeof x === "object" &&
            "id" in x &&
            "text" in x &&
            "done" in x,
        )
        .map((x) => ({
          id: asString(x.id),
          text: asString(x.text),
          done: !!x.done,
        }))
    : [];
}
export function markdownChecklist(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => /^\s*[-*] \[[ xX]\]/.test(line))
    .map((line, index) => ({
      id: String(index),
      text: line.replace(/^\s*[-*] \[[ xX]\]\s*/, ""),
      done: /\[[xX]\]/.test(line),
    }));
}
export function objectImageId(object: ProjectObject) {
  return asString(object.data.imageFileId) || asString(object.data.fileId);
}

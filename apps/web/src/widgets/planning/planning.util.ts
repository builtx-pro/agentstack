import type { ProjectObject } from "@shared/api/schemas";
export function planningChildren(
  object: ProjectObject,
  objects: ProjectObject[],
) {
  return objects.filter(
    (child) =>
      child.id !== object.id &&
      child.archived === object.archived &&
      (object.kind === "wave"
        ? child.kind === "epic" && child.data.waveId === object.id
        : object.kind === "epic"
          ? child.kind === "story" && child.data.epicId === object.id
          : object.kind === "sprint"
            ? child.kind === "story" && child.data.sprintId === object.id
            : false),
  );
}
export function planningRoots(objects: ProjectObject[]) {
  const ids = new Set(objects.map((o) => o.id));
  return objects.filter((object) =>
    object.kind === "epic"
      ? !ids.has(String(object.data.waveId))
      : object.kind === "story"
        ? !ids.has(String(object.data.epicId)) &&
          !ids.has(String(object.data.sprintId))
        : true,
  );
}
export function planningSummary(
  object: ProjectObject,
  objects: ProjectObject[],
) {
  const children = planningChildren(object, objects);
  const stories =
    object.kind === "story"
      ? [object]
      : object.kind === "wave"
        ? children.flatMap((epic) => planningChildren(epic, objects))
        : children.filter((child) => child.kind === "story");
  const unique = [
    ...new Map(stories.map((story) => [story.id, story])).values(),
  ];
  const done = unique.filter((story) => story.status === "done").length;
  return {
    done,
    total: unique.length,
    blocked: unique.filter((story) => story.data.blocked === true).length,
    percent: unique.length ? (done / unique.length) * 100 : 0,
  };
}

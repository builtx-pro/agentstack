import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useI18n } from "@shared/i18n";
import { statusLabels } from "@shared/lib/labels.constant";
import { WorkspaceService } from "@units/workspace";
import { useReviewActions } from "@units/review/service/use-review-actions.hook";
import { ReviewActionDialog } from "@units/review/ui/review-action.component";
import { NoteCard } from "@units/review/ui/note-card.component";
import type { ProjectObject, ReviewNote } from "@shared/api/schemas";
import { storyTask } from "../lib/task-board.util";
import { TaskBoard } from "./task-board.component";
import classes from "./task-board.module.css";
export function ProjectTasks({
  projectId,
  projectName,
  objects,
  notes,
  canEdit,
  onOpen,
  onCreate,
}: {
  projectId: string;
  projectName: string;
  objects: ProjectObject[];
  notes: ReviewNote[];
  canEdit: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState("tasks");
  const [q, setQ] = useState("");
  const [sprint, setSprint] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const mutation = WorkspaceService.useWorkspaceMutation(projectId);
  const actions = useReviewActions(projectId);
  const tasks = useMemo(
    () =>
      objects
        .filter(
          (o) =>
            o.kind === "story" &&
            !o.archived &&
            (!sprint || o.data.sprintId === sprint) &&
            `${o.title} ${o.description} ${o.tags.join(" ")}`
              .toLocaleLowerCase()
              .includes(q.toLocaleLowerCase()),
        )
        .map((o) => storyTask(o, projectName)),
    [objects, sprint, q, projectName],
  );
  const filteredNotes = notes.filter((n) =>
    `${n.body} ${objects.find((o) => o.id === n.targetId)?.title ?? ""}`
      .toLocaleLowerCase()
      .includes(q.toLocaleLowerCase()),
  );
  const selected = notes.find((n) => n.id === noteId);
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <SegmentedControl
          aria-label={t("Board type")}
          value={mode}
          onChange={setMode}
          data={[
            { value: "tasks", label: t("Project tasks") },
            { value: "agents", label: t("Agent work") },
          ]}
        />
        {canEdit && mode === "tasks" && (
          <Button onClick={onCreate}>{t("New project task")}</Button>
        )}
      </Group>
      <div className={classes.toolbar}>
        <TextInput
          label={t("Search tasks")}
          value={q}
          leftSection={<IconSearch size={18} />}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        {mode === "tasks" && (
          <Select
            label={t("Sprint")}
            clearable
            placeholder={t("All sprints")}
            value={sprint}
            onChange={setSprint}
            data={objects
              .filter((o) => o.kind === "sprint" && !o.archived)
              .map((o) => ({ value: o.id, label: o.title }))}
          />
        )}
      </div>
      {mode === "tasks" ? (
        <>
          <Text size="sm" c="dimmed">
            {t("Drag cards or use their status selector.")}
          </Text>
          <TaskBoard
            tasks={tasks}
            canMove={canEdit}
            pending={mutation.isPending}
            onOpen={(task) => onOpen(task.id)}
            onMove={(task, status) =>
              mutation.mutate({
                path: `/projects/${projectId}/objects/${task.id}`,
                method: "PATCH",
                body: { expectedVersion: task.version, status },
              })
            }
          />
        </>
      ) : (
        <>
          <Text size="sm" c="dimmed">
            {t(
              "Agent claims and submissions move cards automatically. Only a human accepts a result. Updates every 20 seconds while this page is visible.",
            )}
          </Text>
          <div className={classes.agentBoard}>
            {(
              ["open", "in_progress", "ready_for_review", "resolved"] as const
            ).map((status) => {
              const items = filteredNotes.filter((n) => n.status === status);
              return (
                <section
                  className={classes.column}
                  key={status}
                  aria-label={t(statusLabels[status]!)}
                >
                  <Group justify="space-between">
                    <Title order={2} size="sm">
                      {t(statusLabels[status]!)}
                    </Title>
                    <Badge variant="default">{items.length}</Badge>
                  </Group>
                  <ul className={classes.list}>
                    {items.slice(0, limits[status] ?? 30).map((note) => (
                      <li key={note.id}>
                        <article className={classes.card}>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed">
                              {objects.find((o) => o.id === note.targetId)
                                ?.title ?? t("Review item")}
                            </Text>
                            <button
                              type="button"
                              className={classes.title}
                              onClick={() => setNoteId(note.id)}
                            >
                              {note.body.length > 180
                                ? `${note.body.slice(0, 180)}…`
                                : note.body}
                            </button>
                            <Text size="xs" c="dimmed">
                              {note.authorName} · v{note.targetVersion}
                            </Text>
                            {note.claimedBy && (
                              <Badge variant="light">{t("Claimed")}</Badge>
                            )}
                            {note.result && (
                              <Text size="xs">
                                {t(
                                  note.result.evidenceSource === "agent"
                                    ? "Agent-reported result"
                                    : "Human-reported result",
                                )}
                              </Text>
                            )}
                          </Stack>
                        </article>
                      </li>
                    ))}
                  </ul>
                  {!items.length && (
                    <p className={classes.empty}>
                      {t("No tasks in this column.")}
                    </p>
                  )}
                  {items.length > (limits[status] ?? 30) && (
                    <Button
                      variant="subtle"
                      onClick={() =>
                        setLimits((p) => ({
                          ...p,
                          [status]: (p[status] ?? 30) + 30,
                        }))
                      }
                    >
                      {t("Show more tasks")}
                    </Button>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
      {selected && !actions.active && (
        <Modal
          opened
          onClose={() => setNoteId(null)}
          title={t("Agent work")}
          size="lg"
        >
          <NoteCard
            note={selected}
            canEdit={canEdit}
            onAction={(action) => actions.open(selected, action)}
            onOpenTarget={() => {
              setNoteId(null);
              onOpen(selected.targetId);
            }}
          />
        </Modal>
      )}
      <ReviewActionDialog actions={actions} />
    </Stack>
  );
}

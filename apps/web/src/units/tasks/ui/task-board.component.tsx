import { useState } from "react";
import {
  Badge,
  Button,
  Group,
  Progress,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useI18n } from "@shared/i18n";
import { statusLabels } from "@shared/lib/labels.constant";
import { groupTasks, taskStatuses } from "../lib/task-board.util";
import type { Task } from "../model/task.schema";
import classes from "./task-board.module.css";
export function TaskBoard({
  tasks,
  onOpen,
  onMove,
  canMove = true,
  pending = false,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onMove: (task: Task, status: Task["status"]) => void;
  canMove?: boolean;
  pending?: boolean;
}) {
  const { t } = useI18n();
  const [drag, setDrag] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  return (
    <div className={classes.board} aria-label={t("Task board")}>
      {groupTasks(tasks).map(({ status, items }) => (
        <section
          className={classes.column}
          key={status}
          aria-label={t(statusLabels[status]!)}
          onDragOver={(e) => {
            if (canMove && !pending && drag) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const task = tasks.find((x) => `${x.source}:${x.id}` === drag);
            setDrag(null);
            if (
              task &&
              task.canEdit &&
              canMove &&
              !pending &&
              task.status !== status
            )
              onMove(task, status);
          }}
        >
          <Group justify="space-between">
            <Title order={2} size="sm">
              {t(statusLabels[status]!)}
            </Title>
            <Badge variant="default">{items.length}</Badge>
          </Group>
          <ul className={classes.list}>
            {items.slice(0, limits[status] ?? 30).map((task) => (
              <li key={`${task.source}:${task.id}`}>
                <article
                  className={classes.card}
                  draggable={canMove && task.canEdit && !pending}
                  onDragStart={(e) => {
                    setDrag(`${task.source}:${task.id}`);
                    e.dataTransfer.setData("text/plain", task.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDrag(null)}
                >
                  <Stack gap="sm">
                    <Group gap={6}>
                      <Badge
                        variant="light"
                        color={task.source === "personal" ? "gray" : undefined}
                      >
                        {t(task.source === "personal" ? "Private" : "Project")}
                      </Badge>
                      {task.blocked && (
                        <Badge color="red">{t("Blocked")}</Badge>
                      )}
                      {task.priority !== "normal" && (
                        <Badge
                          color={task.priority === "urgent" ? "red" : "orange"}
                          variant="outline"
                        >
                          {t(task.priority)}
                        </Badge>
                      )}
                    </Group>
                    <button
                      type="button"
                      className={classes.title}
                      onClick={() => onOpen(task)}
                    >
                      {task.title}
                    </button>
                    {task.projectName && (
                      <Text size="xs" c="dimmed">
                        {task.projectName}
                      </Text>
                    )}
                    {task.description && (
                      <Text size="sm" c="dimmed" lineClamp={3}>
                        {task.description
                          .replace(/^#{1,6}\s+/gm, "")
                          .replace(/[*_`]/g, "")}
                      </Text>
                    )}
                    {task.checklist.length > 0 && (
                      <div>
                        <Text size="xs" c="dimmed" mb={5}>
                          {t("Checklist")} ·{" "}
                          {task.checklist.filter((c) => c.done).length}/
                          {task.checklist.length}
                        </Text>
                        <Progress
                          value={
                            (task.checklist.filter((c) => c.done).length /
                              task.checklist.length) *
                            100
                          }
                          size="xs"
                        />
                      </div>
                    )}
                    {task.tags.length > 0 && (
                      <Group gap={4}>
                        {task.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="default" tt="none">
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                    )}
                    {canMove && task.canEdit && (
                      <Select
                        label={t("Move task")}
                        aria-label={t("Move {title}", { title: task.title })}
                        value={task.status}
                        data={taskStatuses.map((value) => ({
                          value,
                          label: t(statusLabels[value]!),
                        }))}
                        disabled={pending}
                        onChange={(value) => {
                          if (value && value !== task.status)
                            onMove(task, value as Task["status"]);
                        }}
                      />
                    )}
                  </Stack>
                </article>
              </li>
            ))}
          </ul>
          {items.length === 0 && (
            <p className={classes.empty}>{t("No tasks in this column.")}</p>
          )}
          {items.length > (limits[status] ?? 30) && (
            <Button
              variant="subtle"
              mt="sm"
              fullWidth
              onClick={() =>
                setLimits((previous) => ({
                  ...previous,
                  [status]: (previous[status] ?? 30) + 30,
                }))
              }
            >
              {t("Show more tasks")}
            </Button>
          )}
        </section>
      ))}
    </div>
  );
}

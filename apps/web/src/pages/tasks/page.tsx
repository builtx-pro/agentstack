import { useState } from "react";
import { useLoadMore } from "@units/catalog/service/use-load-more.hook";
import { Navigate, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { AuthService } from "@units/auth";
import { WorkspaceService } from "@units/workspace";
import { Shell } from "@widgets/shell/shell.widget";
import { QueryState } from "@shared/ui/query-state.component";
import { useI18n } from "@shared/i18n";
import { TaskBoard } from "@units/tasks/ui/task-board.component";
import { PersonalTaskEditor } from "@units/tasks/ui/personal-task-editor.component";
import { TaskHistory } from "@units/tasks/ui/task-history.component";
import { useTasks, useTaskActions } from "@units/tasks/service/use-tasks.hook";
import type { Task, TaskFilters } from "@units/tasks/model/task.schema";
import classes from "@units/tasks/ui/task-board.module.css";
export function TasksPage() {
  const auth = AuthService.useAuth();
  if (auth.isPending) return <QueryState pending />;
  if (!auth.data) return <Navigate to="/login" />;
  return <MyTasks key={auth.data.user.id} user={auth.data.user} />;
}
function MyTasks({
  user,
}: {
  user: NonNullable<ReturnType<typeof AuthService.useAuth>["data"]>["user"];
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [q] = useDebouncedValue(search, 250);
  const [source, setSource] = useState<TaskFilters["source"]>("all");
  const [archived, setArchived] = useState<TaskFilters["archived"]>("false");
  const query = useTasks(user.id, { source, q, status: "", archived });
  const actions = useTaskActions(user.id);
  const projects = WorkspaceService.useProjects();
  const [editor, setEditor] = useState<Task | null | undefined>();
  const [selected, setSelected] = useState<Task | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const sentinel = useLoadMore(
    !!query.hasNextPage && !query.isFetchingNextPage && !query.isError,
    () => void query.fetchNextPage(),
  );
  const tasks = query.data?.pages.flatMap((page) => page.items) ?? [];
  const open = (task: Task) => {
    if (task.source === "personal") setSelected(task);
    else if (task.projectId)
      void navigate({
        to: "/projects/$projectId/$section",
        params: { projectId: task.projectId, section: "tasks" },
        search: {
          selected: task.id,
          q: "",
          tag: "",
          variant: "",
          palette: "",
          flow: "",
          status: "",
          kind: "",
          archived: false,
        },
      });
  };
  return (
    <Shell user={user} projects={projects.data}>
      <Stack gap="xl">
        <Group justify="space-between" align="start">
          <div>
            <Text c="dimmed" size="sm" mb={8}>
              {t("Your workspace")}
            </Text>
            <Title order={1}>{t("My tasks")}</Title>
            <Text c="dimmed" mt="xs">
              {t("Private work and your assigned project tasks, together.")}
            </Text>
          </div>
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => setEditor(null)}
          >
            {t("New private task")}
          </Button>
        </Group>
        <div className={classes.toolbar}>
          <TextInput
            label={t("Search tasks")}
            leftSection={<IconSearch size={18} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Select
            label={t("Task source")}
            value={source}
            data={[
              { value: "all", label: t("All my tasks") },
              { value: "personal", label: t("Private tasks") },
              { value: "assigned", label: t("Assigned to me") },
            ]}
            onChange={(v) => v && setSource(v as TaskFilters["source"])}
          />
          <Select
            label={t("Archive")}
            value={archived}
            data={[
              { value: "false", label: t("Active") },
              { value: "true", label: t("Archived") },
              { value: "all", label: t("All") },
            ]}
            onChange={(v) => v && setArchived(v as TaskFilters["archived"])}
          />
        </div>
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
        {query.data && (
          <>
            <Text size="sm" c="dimmed" role="status">
              {t("{count} tasks loaded", { count: tasks.length })} ·{" "}
              {t("Drag cards or use their status selector.")}
            </Text>
            <TaskBoard
              tasks={tasks}
              pending={actions.move.isPending}
              onOpen={open}
              onMove={(task, status) => actions.move.mutate({ task, status })}
            />
          </>
        )}
        <div ref={sentinel} />
        {query.hasNextPage && (
          <Button
            variant="default"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t("Load more")}
          </Button>
        )}
        {query.isFetchingNextPage && <QueryState pending />}
      </Stack>
      {editor !== undefined && (
        <PersonalTaskEditor
          owner={user.id}
          task={editor ?? undefined}
          onClose={() => setEditor(undefined)}
        />
      )}
      {selected && (
        <Modal
          opened
          onClose={() => setSelected(null)}
          title={selected.title}
          size="lg"
        >
          <Stack>
            <Text style={{ whiteSpace: "pre-wrap" }}>
              {selected.description || t("No description yet.")}
            </Text>
            <Text size="sm" c="dimmed">
              {t("Only you can access this task and its history.")}
            </Text>
            <Group>
              <Button
                onClick={() => {
                  setEditor(selected);
                  setSelected(null);
                }}
              >
                {t("Edit")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  setHistory(selected.id);
                  setSelected(null);
                }}
              >
                {t("History")}
              </Button>
              <Button
                variant="subtle"
                color="gray"
                loading={actions.archive.isPending}
                onClick={() =>
                  actions.archive.mutate(selected, {
                    onSuccess: () => setSelected(null),
                  })
                }
              >
                {t(selected.archived ? "Restore" : "Archive")}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
      {history && (
        <TaskHistory
          owner={user.id}
          id={history}
          onClose={() => setHistory(null)}
        />
      )}
    </Shell>
  );
}

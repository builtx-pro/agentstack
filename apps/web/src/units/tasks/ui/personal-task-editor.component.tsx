import { getPersonalTask } from "../api/tasks.api";
import { ApiError } from "@shared/api/client";
import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  TagsInput,
  Textarea,
  TextInput,
  Text,
} from "@mantine/core";
import { IconTrash, IconPlus } from "@tabler/icons-react";
import { useI18n } from "@shared/i18n";
import { errorMessage } from "@shared/i18n/error-message.util";
import { statusLabels } from "@shared/lib/labels.constant";
import { taskStatuses } from "../lib/task-board.util";
import type { PersonalDraft, Task } from "../model/task.schema";
import { useTaskActions } from "../service/use-tasks.hook";
export function PersonalTaskEditor({
  owner,
  task,
  onClose,
}: {
  owner: string;
  task?: Task;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const actions = useTaskActions(owner);
  const [baseVersion, setBaseVersion] = useState(task?.version);
  const [current, setCurrent] = useState<Task | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<Error | null>(null);
  const [id] = useState(() => task?.id ?? crypto.randomUUID());
  const [draft, setDraft] = useState<PersonalDraft>(() =>
    task
      ? {
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          blocked: task.blocked,
          checklist: task.checklist,
          tags: task.tags,
        }
      : {
          title: "",
          description: "",
          status: "backlog",
          priority: "normal",
          blocked: false,
          checklist: [],
          tags: [],
        },
  );
  const [line, setLine] = useState("");
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const change = (next: Partial<PersonalDraft>) => {
    setDirty(true);
    setDraft((previous) => ({ ...previous, ...next }));
  };
  const close = () => {
    if (actions.save.isPending) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  return (
    <Modal
      opened
      onClose={close}
      closeOnClickOutside={false}
      size="lg"
      title={t(task ? "Edit private task" : "New private task")}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          actions.save.mutate(
            { id, draft, version: baseVersion },
            { onSuccess: onClose },
          );
        }}
      >
        <Stack>
          <Text c="dimmed" size="sm">
            {t("Only you can access this task and its history.")}
          </Text>
          {actions.save.error && (
            <Alert color="red" role="alert">
              {errorMessage(actions.save.error)}{" "}
              {t(
                "Your draft is preserved. Review the saved version before retrying.",
              )}
            </Alert>
          )}
          {actions.save.error instanceof ApiError &&
            actions.save.error.status === 409 && (
              <Stack>
                {refreshError && (
                  <Text c="red" role="alert">
                    {errorMessage(refreshError)}
                  </Text>
                )}
                <Button
                  type="button"
                  variant="default"
                  loading={refreshing}
                  onClick={() => {
                    setRefreshing(true);
                    setRefreshError(null);
                    void getPersonalTask(id)
                      .then(setCurrent)
                      .catch(setRefreshError)
                      .finally(() => setRefreshing(false));
                  }}
                >
                  {t("Load saved version")}
                </Button>
                {current && (
                  <Alert
                    title={t("Saved version {version}", {
                      version: current.version,
                    })}
                  >
                    <Stack gap="xs">
                      <Text fw={600}>{current.title}</Text>
                      <Text style={{ whiteSpace: "pre-wrap" }}>
                        {current.description}
                      </Text>
                      <Text>
                        {t(statusLabels[current.status]!)} ·{" "}
                        {t(current.priority)} · {current.tags.join(", ")}
                      </Text>
                      <Text>
                        {t(current.blocked ? "Blocked" : "Not blocked")}
                      </Text>
                      {current.checklist.map((item) => (
                        <Text key={item.id}>
                          {item.done ? "✓" : "○"} {item.text}
                        </Text>
                      ))}
                      <Button
                        type="button"
                        onClick={() => {
                          setBaseVersion(current.version);
                          actions.save.reset();
                          setCurrent(null);
                        }}
                      >
                        {t("Keep my draft and use this version")}
                      </Button>
                    </Stack>
                  </Alert>
                )}
              </Stack>
            )}
          {discard && (
            <Alert color="orange">
              <Stack>
                <Text>{t("Discard unsaved changes?")}</Text>
                <Group>
                  <Button type="button" color="red" onClick={onClose}>
                    {t("Discard")}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => setDiscard(false)}
                  >
                    {t("Keep editing")}
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}
          <TextInput
            label={t("Title")}
            required
            maxLength={240}
            value={draft.title}
            disabled={actions.save.isPending}
            onChange={(e) => change({ title: e.currentTarget.value })}
          />
          <Textarea
            label={t("Description")}
            minRows={4}
            autosize
            maxRows={10}
            maxLength={8000}
            value={draft.description}
            disabled={actions.save.isPending}
            onChange={(e) => change({ description: e.currentTarget.value })}
          />
          <Group grow align="start">
            <Select
              label={t("Status")}
              value={draft.status}
              disabled={actions.save.isPending}
              data={taskStatuses.map((value) => ({
                value,
                label: t(statusLabels[value]!),
              }))}
              onChange={(v) => v && change({ status: v as Task["status"] })}
            />
            <Select
              label={t("Priority")}
              value={draft.priority}
              disabled={actions.save.isPending}
              data={["low", "normal", "high", "urgent"].map((value) => ({
                value,
                label: t(value),
              }))}
              onChange={(v) => v && change({ priority: v as Task["priority"] })}
            />
          </Group>
          <Checkbox
            label={t("Blocked")}
            checked={draft.blocked}
            disabled={actions.save.isPending}
            onChange={(e) => change({ blocked: e.currentTarget.checked })}
          />
          <TagsInput
            label={t("Tags")}
            value={draft.tags}
            maxTags={40}
            disabled={actions.save.isPending}
            onChange={(tags) => change({ tags })}
          />
          <fieldset
            style={{ border: 0, padding: 0, margin: 0 }}
            disabled={actions.save.isPending}
          >
            <legend>{t("Checklist")}</legend>
            <Stack mt="xs">
              {draft.checklist.map((item) => (
                <Group key={item.id} wrap="nowrap">
                  <Checkbox
                    style={{ flex: 1 }}
                    label={item.text}
                    checked={item.done}
                    onChange={(event) =>
                      change({
                        checklist: draft.checklist.map((c) =>
                          c.id === item.id
                            ? { ...c, done: event.currentTarget.checked }
                            : c,
                        ),
                      })
                    }
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size={36}
                    type="button"
                    aria-label={t("Remove {title}", { title: item.text })}
                    onClick={() =>
                      change({
                        checklist: draft.checklist.filter(
                          (c) => c.id !== item.id,
                        ),
                      })
                    }
                  >
                    <IconTrash size={18} />
                  </ActionIcon>
                </Group>
              ))}
              <Group wrap="nowrap">
                <TextInput
                  style={{ flex: 1 }}
                  aria-label={t("New checklist item")}
                  placeholder={t("New checklist item")}
                  maxLength={2000}
                  value={line}
                  onChange={(e) => setLine(e.currentTarget.value)}
                />
                <ActionIcon
                  type="button"
                  size={42}
                  disabled={!line.trim() || draft.checklist.length >= 200}
                  aria-label={t("Add checklist item")}
                  onClick={() => {
                    change({
                      checklist: [
                        ...draft.checklist,
                        {
                          id: crypto.randomUUID(),
                          text: line.trim(),
                          done: false,
                        },
                      ],
                    });
                    setLine("");
                  }}
                >
                  <IconPlus size={18} />
                </ActionIcon>
              </Group>
            </Stack>
          </fieldset>
          <Group justify="end">
            <Button
              type="button"
              variant="default"
              disabled={actions.save.isPending}
              onClick={close}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              loading={actions.save.isPending}
              disabled={!draft.title.trim()}
            >
              {t("Save task")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

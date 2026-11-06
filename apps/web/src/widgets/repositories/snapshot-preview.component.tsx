import {useI18n} from '@shared/i18n';
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Markdown } from "@shared/ui/markdown.component";
import { WorkspaceService } from "@units/workspace";
import {
  repositoryError,
  useRepositoryActions,
  useSnapshot,
  type Repository,
  type RepositoryEntry,
} from "@units/repositories";
import classes from "./repositories.module.css";
export function SnapshotPreview({
  projectId,
  connection,
  snapshotId,
  onClose,
}: {
  projectId: string;
  connection: Repository;
  snapshotId: string;
  onClose: () => void;
}) {const {t}=useI18n();
  const query = useSnapshot(projectId, connection.id, snapshotId);
  const objects = WorkspaceService.useObjects(projectId);
  const actions = useRepositoryActions(projectId);
  const [selected, setSelected] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string>("");
  const [confirm, setConfirm] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [applied, setApplied] = useState(false);
  const entries = query.data?.entries ?? [];
  const chosen = entries.filter((entry) => selected.includes(entry.key));
  const eligibleEntries = entries.filter(
    (entry) =>
      !!entry.draft &&
      ["new", "changed", "conflict"].includes(entry.state) &&
      (entry.state !== "conflict" || conflicts.includes(entry.key)) &&
      !applied &&
      !connection.archived,
  );
  const sensitive = chosen.some(
    (entry) => entry.kind === "rule" || entry.draft?.status === "done",
  );
  const toggle = (entry: RepositoryEntry, checked: boolean) =>
    setSelected((previous) =>
      checked
        ? [...previous, entry.key]
        : previous.filter((key) => key !== entry.key),
    );
  const reloadPreview = async () => {
    setConfirm(false);
    setSelected([]);
    setConflicts([]);
    setReviewed(false);
    actions.apply.reset();
    await Promise.all([query.refetch(), objects.refetch()]);
  };
  const apply = async () => {
    await actions.apply.mutateAsync({
      connection: connection.id,
      snapshot: snapshotId,
      expectedVersion: connection.version,
      entries: chosen.map((entry) => ({
        key: entry.key,
        expectedObjectVersion: entry.currentVersion ?? null,
        ...(entry.state === "conflict" ? { resolveConflict: true } : {}),
      })),
    });
    setConfirm(false);
    setApplied(true);
    setSelected([]);
  };
  return (
    <Modal
      opened
      onClose={onClose}
      title={t("Review repository changes")}
      closeButtonProps={{ "aria-label": t("Close repository preview") }}
      size="xl"
    >
      <Stack>
        {connection.archived && (
          <Alert color="gray">{t("This connection is archived. History is available for reading; restore the connection before applying changes.")}</Alert>
        )}
        {query.error ? (
          <Alert color="red">
            {repositoryError(query.error)}
            <Button
              variant="subtle"
              onClick={() => void query.refetch()}
            >{t("Reload preview")}</Button>
          </Alert>
        ) : query.isPending ? (
          <Text>{t("Loading snapshot…")}</Text>
        ) : (
          query.data && (
            <>
              <Group justify="space-between">
                <Text size="sm">
                  {query.data.branch} · {query.data.commit.slice(0, 12)}
                </Text>
                <Badge
                  color={query.data.source === "provider" ? "teal" : "gray"}
                >
                  {query.data.source === "provider"
                    ? t("Fetched from provider")
                    : t("Reported checkout")}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {t('Entries: {count}. Missing files remain in the workspace. Applying changes never accepts review comments.',{count:entries.length})}</Text>
              {applied && (
                <Alert color="teal">{t("Selected changes were applied as new revisions.")}</Alert>
              )}
              {actions.apply.error && (
                <Alert color="red">
                  {repositoryError(actions.apply.error)}
                  <Button
                    variant="subtle"
                    onClick={() => void reloadPreview()}
                  >{t("Reload preview")}</Button>
                </Alert>
              )}
              <Group justify="space-between">
                <Group gap="xs">
                  <Text size="sm">{t('Selected: {count}',{count:selected.length})}</Text>
                  <Button
                    variant="light"
                    disabled={!eligibleEntries.length}
                    onClick={() =>
                      setSelected(eligibleEntries.map((entry) => entry.key))
                    }
                  >{t('Select all eligible ({count})',{count:eligibleEntries.length})}
                  </Button>
                  <Button
                    variant="subtle"
                    disabled={!selected.length}
                    onClick={() => setSelected([])}
                  >{t("Clear selection")}</Button>
                </Group>
                <Button
                  disabled={!selected.length || applied || connection.archived}
                  onClick={() => {
                    setConfirm(true);
                    setReviewed(false);
                  }}
                >{t("Apply selected changes")}</Button>
              </Group>
              <Text size="xs" c="dimmed">{t("Conflicts require acknowledgement before selection. Missing and unchanged entries are excluded.")}</Text>
              {entries.map((entry) => {
                const current = objects.data?.find(
                  (object) =>
                    object.key ===
                    (entry.draft?.key ?? `repo:${connection.id}:${entry.key}`),
                );
                const conflict = entry.state === "conflict";
                const eligible =
                  !!entry.draft &&
                  ["new", "changed", "conflict"].includes(entry.state) &&
                  (!conflict || conflicts.includes(entry.key)) &&
                  !applied &&
                  !connection.archived;
                const markdown = entry.draft?.data.markdown;
                return (
                  <div className={classes.entry} key={entry.key}>
                    <Group justify="space-between" align="start" wrap="nowrap">
                      <Checkbox
                        className={classes.entryChoice}
                        classNames={{
                          labelWrapper: classes.entryLabelWrapper,
                          label: classes.entryText,
                          description: classes.entryText,
                        }}
                        checked={selected.includes(entry.key)}
                        disabled={!eligible}
                        onChange={(event) =>
                          toggle(entry, event.currentTarget.checked)
                        }
                        label={entry.title}
                        description={entry.path}
                      />
                      <Badge
                        className={classes.entryStatus}
                        color={
                          conflict
                            ? "orange"
                            : entry.state === "missing"
                              ? "red"
                              : "gray"
                        }
                      >
                        {t(entry.state)}
                      </Badge>
                    </Group>
                    {entry.reason && (
                      <Text size="sm" c="dimmed" mt="xs">
                        {t(entry.reason)}
                      </Text>
                    )}
                    {conflict && (
                      <Checkbox
                        mt="sm"
                        label={t('Resolve conflict for {title}',{title:entry.title})}
                        disabled={connection.archived}
                        description={t('I reviewed workspace revision {version} and the repository draft.',{version:entry.currentVersion ?? t('unknown')})}
                        checked={conflicts.includes(entry.key)}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setConflicts((previous) =>
                            checked
                              ? [...previous, entry.key]
                              : previous.filter((key) => key !== entry.key),
                          );
                          if (!checked) toggle(entry, false);
                        }}
                      />
                    )}
                    {entry.state === "missing" && (
                      <Text size="sm" c="dimmed" mt="xs">{t("No deletion or archive will be performed.")}</Text>
                    )}
                    <Button
                      className={classes.compareButton}
                      classNames={{ label: classes.compareButtonLabel }}
                      aria-label={`${expanded === entry.key ? t("Hide comparison") : t("Compare changes")}: ${entry.title}`}
                      variant="subtle"
                      mt="sm"
                      onClick={() =>
                        setExpanded(expanded === entry.key ? "" : entry.key)
                      }
                    >
                      {expanded === entry.key
                        ? t("Hide comparison")
                        : t("Compare changes")}
                    </Button>
                    {expanded === entry.key && (
                      <SimpleGrid cols={{ base: 1, md: 2 }} mt="md">
                        <div className={classes.compare}>
                          <Title order={5} mb="sm">{t("Current ·")}{" "}
                            {current
                              ? `v${current.version}`
                              : t('not in workspace')}
                          </Title>
                          {current && (
                            <>
                              <Text size="sm" fw={600}>
                                {current.title}
                              </Text>
                              <Text size="xs" c="dimmed" mb="sm">
                                {t(current.kind)} · {t(current.status)} · {t(current.visibility)}
                              </Text>
                              <details>
                                <summary>{t("Current metadata")}</summary>
                                <pre>
                                  {JSON.stringify(
                                    {
                                      description: current.description,
                                      tags: current.tags,
                                      data: {
                                        ...current.data,
                                        markdown: undefined,
                                      },
                                    },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            </>
                          )}
                          {typeof current?.data.markdown === "string" ? (
                            <Markdown>{current.data.markdown}</Markdown>
                          ) : (
                            <pre>
                              {current
                                ? JSON.stringify(
                                    {
                                      title: current.title,
                                      status: current.status,
                                      description: current.description,
                                      data: current.data,
                                    },
                                    null,
                                    2,
                                  )
                                : t("New item")}
                            </pre>
                          )}
                        </div>
                        <div className={classes.compare}>
                          <Title order={5} mb="sm">{t("Repository draft")}</Title>
                          {entry.draft && (
                            <>
                              <Text size="sm" fw={600}>
                                {entry.draft.title}
                              </Text>
                              <Text size="xs" c="dimmed" mb="sm">
                                {t(entry.draft.kind)} · {t(entry.draft.status)} · {t(entry.draft.visibility)}
                              </Text>
                              <details>
                                <summary>{t("Draft metadata")}</summary>
                                <pre>
                                  {JSON.stringify(
                                    {
                                      description: entry.draft.description,
                                      tags: entry.draft.tags,
                                      data: {
                                        ...entry.draft.data,
                                        markdown: undefined,
                                      },
                                    },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            </>
                          )}
                          {typeof markdown === "string" ? (
                            <Markdown>{markdown}</Markdown>
                          ) : (
                            <pre>
                              {entry.draft
                                ? JSON.stringify(entry.draft, null, 2)
                                : t("File missing from this snapshot")}
                            </pre>
                          )}
                        </div>
                      </SimpleGrid>
                    )}
                  </div>
                );
              })}
            </>
          )
        )}
      </Stack>
      <Modal
        opened={confirm}
        onClose={() => setConfirm(false)}
        title={t("Confirm repository changes")}
        closeButtonProps={{ "aria-label": t("Close apply confirmation") }}
        size="md"
      >
        <Stack>
          <Text>{t('Apply {count} selected changes to this project? Existing records receive new revisions.',{count:chosen.length})}</Text>
          {sensitive && (
            <Alert color="orange">{t("This selection includes agent rules or completed work. Confirm that the new rules and completion evidence are correct.")}</Alert>
          )}
          <Checkbox
            label={t("I reviewed these changes and approve applying them")}
            checked={reviewed}
            onChange={(event) => setReviewed(event.currentTarget.checked)}
          />
          {actions.apply.error && (
            <Alert color="red">
              {repositoryError(actions.apply.error)}
              <Button
                variant="subtle"
                onClick={() => void reloadPreview()}
              >{t("Reload preview")}</Button>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirm(false)}>{t("Cancel")}</Button>
            <Button
              disabled={!reviewed || connection.archived}
              loading={actions.apply.isPending}
              onClick={() => void apply().catch(() => {})}
            >{t("Confirm and apply")}</Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}

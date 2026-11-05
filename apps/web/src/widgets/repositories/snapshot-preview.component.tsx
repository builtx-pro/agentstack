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
}) {
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
      title="Review repository changes"
      closeButtonProps={{ "aria-label": "Close repository preview" }}
      size="xl"
    >
      <Stack>
        {connection.archived && (
          <Alert color="gray">
            This connection is archived. History is available for reading;
            restore the connection before applying changes.
          </Alert>
        )}
        {query.error ? (
          <Alert color="red">
            {repositoryError(query.error)}
            <Button
              size="xs"
              variant="subtle"
              onClick={() => void query.refetch()}
            >
              Reload preview
            </Button>
          </Alert>
        ) : query.isPending ? (
          <Text>Loading snapshot…</Text>
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
                    ? "Fetched from provider"
                    : "Reported checkout"}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {entries.length} entries. Missing files remain in the workspace.
                Applying changes never accepts review comments.
              </Text>
              {applied && (
                <Alert color="teal">
                  Selected changes were applied as new revisions.
                </Alert>
              )}
              {actions.apply.error && (
                <Alert color="red">
                  {repositoryError(actions.apply.error)}
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => void reloadPreview()}
                  >
                    Reload preview
                  </Button>
                </Alert>
              )}
              <Group justify="space-between">
                <Group gap="xs">
                  <Text size="sm">{selected.length} selected</Text>
                  <Button
                    size="xs"
                    variant="light"
                    disabled={!eligibleEntries.length}
                    onClick={() =>
                      setSelected(eligibleEntries.map((entry) => entry.key))
                    }
                  >
                    Select all eligible ({eligibleEntries.length})
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    disabled={!selected.length}
                    onClick={() => setSelected([])}
                  >
                    Clear selection
                  </Button>
                </Group>
                <Button
                  disabled={!selected.length || applied || connection.archived}
                  onClick={() => {
                    setConfirm(true);
                    setReviewed(false);
                  }}
                >
                  Apply selected changes
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                Conflicts require acknowledgement before selection. Missing and
                unchanged entries are excluded.
              </Text>
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
                        {entry.state}
                      </Badge>
                    </Group>
                    {entry.reason && (
                      <Text size="sm" c="dimmed" mt="xs">
                        {entry.reason}
                      </Text>
                    )}
                    {conflict && (
                      <Checkbox
                        mt="sm"
                        label={`Resolve conflict for ${entry.title}`}
                        disabled={connection.archived}
                        description={`I reviewed the workspace revision ${entry.currentVersion ?? "unknown"} and the repository draft.`}
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
                      <Text size="sm" c="dimmed" mt="xs">
                        No deletion or archive will be performed.
                      </Text>
                    )}
                    <Button
                      className={classes.compareButton}
                      classNames={{ label: classes.compareButtonLabel }}
                      aria-label={`${expanded === entry.key ? "Hide comparison" : "Compare changes"}: ${entry.title}`}
                      variant="subtle"
                      size="compact-xs"
                      mt="sm"
                      onClick={() =>
                        setExpanded(expanded === entry.key ? "" : entry.key)
                      }
                    >
                      {expanded === entry.key
                        ? "Hide comparison"
                        : "Compare changes"}
                    </Button>
                    {expanded === entry.key && (
                      <SimpleGrid cols={{ base: 1, md: 2 }} mt="md">
                        <div className={classes.compare}>
                          <Title order={5} mb="sm">
                            Current ·{" "}
                            {current
                              ? `v${current.version}`
                              : "not in workspace"}
                          </Title>
                          {current && (
                            <>
                              <Text size="sm" fw={600}>
                                {current.title}
                              </Text>
                              <Text size="xs" c="dimmed" mb="sm">
                                {current.kind} · {current.status} ·{" "}
                                {current.visibility}
                              </Text>
                              <details>
                                <summary>Current metadata</summary>
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
                                : "New item"}
                            </pre>
                          )}
                        </div>
                        <div className={classes.compare}>
                          <Title order={5} mb="sm">
                            Repository draft
                          </Title>
                          {entry.draft && (
                            <>
                              <Text size="sm" fw={600}>
                                {entry.draft.title}
                              </Text>
                              <Text size="xs" c="dimmed" mb="sm">
                                {entry.draft.kind} · {entry.draft.status} ·{" "}
                                {entry.draft.visibility}
                              </Text>
                              <details>
                                <summary>Draft metadata</summary>
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
                                : "File missing from this snapshot"}
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
        title="Confirm repository changes"
        closeButtonProps={{ "aria-label": "Close apply confirmation" }}
        size="md"
      >
        <Stack>
          <Text>
            Apply {chosen.length} selected changes to this project? Existing
            records receive new revisions.
          </Text>
          {sensitive && (
            <Alert color="orange">
              This selection includes agent rules or completed work. Confirm
              that the new rules and completion evidence are correct.
            </Alert>
          )}
          <Checkbox
            label="I reviewed these changes and approve applying them"
            checked={reviewed}
            onChange={(event) => setReviewed(event.currentTarget.checked)}
          />
          {actions.apply.error && (
            <Alert color="red">
              {repositoryError(actions.apply.error)}
              <Button
                size="xs"
                variant="subtle"
                onClick={() => void reloadPreview()}
              >
                Reload preview
              </Button>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              disabled={!reviewed || connection.archived}
              loading={actions.apply.isPending}
              onClick={() => void apply().catch(() => {})}
            >
              Confirm and apply
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}

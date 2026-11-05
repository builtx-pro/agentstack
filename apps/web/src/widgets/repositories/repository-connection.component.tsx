import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  Text,
  Title,
  Modal,
  TextInput,
  Textarea,
} from "@mantine/core";
import {
  repositoryError,
  useRepositoryActions,
  useSnapshots,
  type Repository,
} from "@units/repositories";
import classes from "./repositories.module.css";
export function RepositoryConnection({
  projectId,
  connection,
  isAdmin,
  onPreview,
}: {
  projectId: string;
  connection: Repository;
  isAdmin: boolean;
  onPreview: (id: string) => void;
}) {
  const actions = useRepositoryActions(projectId);
  const snapshots = useSnapshots(projectId, connection.id, true);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [edit, setEdit] = useState<{
    label: string;
    branch: string;
    roots: string;
  } | null>(null);
  const error = actions.pull.error ?? actions.patch.error;
  const patch = async (body: {
    token?: string | null;
    archived?: boolean;
    sharePipelines?: boolean;
    label?: string;
    branch?: string;
    roots?: string[];
  }) => {
    setMessage("");
    await actions.patch.mutateAsync({
      connection: connection.id,
      expectedVersion: connection.version,
      ...body,
    });
    setMessage("Connection updated.");
  };
  return (
    <Paper withBorder p="lg" className={classes.card}>
      <Stack>
        <Group justify="space-between">
          <div>
            <Title order={4}>{connection.label}</Title>
            <Text size="sm" c="dimmed" className={classes.path}>
              {connection.provider} · {connection.repository} ·{" "}
              {connection.branch}
            </Text>
          </div>
          <Badge color={connection.archived ? "gray" : "violet"}>
            {connection.archived
              ? "Archived"
              : connection.provider === "local"
                ? "CLI / CI"
                : "Web sync"}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed" className={classes.path}>
          ID: {connection.id} · Roots: {connection.roots.join(", ")} ·
          Connection v{connection.version}
        </Text>
        {snapshots.data?.items[0] && (
          <Text size="sm">
            Latest snapshot: {snapshots.data.items[0].commit.slice(0, 12)} ·{" "}
            {new Date(snapshots.data.items[0].createdAt).toLocaleString()}
          </Text>
        )}
        {connection.provider === "local" && !connection.archived && (
          <Alert color="gray">
            Local checkouts are reported by your CLI or CI. The server does not
            execute repository scripts or read your computer.
          </Alert>
        )}
        {error && <Alert color="red">{repositoryError(error)}</Alert>}
        {message && <Alert color="teal">{message}</Alert>}
        <Group>
          {isAdmin && !connection.archived && (
            <Button
              variant="default"
              onClick={() => {
                actions.patch.reset();
                setEdit({
                  label: connection.label,
                  branch: connection.branch,
                  roots: connection.roots.join("\n"),
                });
              }}
            >
              Edit connection settings
            </Button>
          )}
          {!connection.archived && connection.provider !== "local" && (
            <Button
              variant="light"
              loading={actions.pull.isPending}
              onClick={() =>
                void actions.pull
                  .mutateAsync({
                    connection: connection.id,
                    expectedVersion: connection.version,
                  })
                  .then((snapshot) => onPreview(snapshot.id))
                  .catch(() => {})
              }
            >
              Fetch and preview
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="subtle"
              color={connection.archived ? "violet" : "gray"}
              loading={actions.patch.isPending}
              onClick={() =>
                void patch({ archived: !connection.archived }).catch(() => {})
              }
            >
              {connection.archived
                ? "Restore connection"
                : "Archive connection"}
            </Button>
          )}
        </Group>
        <>
          {snapshots.error ? (
            <Alert color="orange">
              Snapshot history is unavailable.{" "}
              <Button
                size="xs"
                variant="subtle"
                onClick={() => void snapshots.refetch()}
              >
                Reload snapshots
              </Button>
            </Alert>
          ) : snapshots.data?.items.length ? (
            <Stack gap="xs">
              {snapshots.data.items.map((snapshot) => (
                <Group key={snapshot.id} justify="space-between">
                  <Text size="sm">
                    {snapshot.commit.slice(0, 12)} · {snapshot.entryCount}{" "}
                    entries ·{" "}
                    {snapshot.source === "provider" ? "Provider" : "Reported"}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => onPreview(snapshot.id)}
                  >
                    Review snapshot
                  </Button>
                </Group>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              {snapshots.isPending ? "Loading snapshots…" : "No snapshots yet."}
            </Text>
          )}
          {isAdmin && !connection.archived && (
            <>
              <Switch
                label="Share pipeline status with customers"
                checked={connection.sharePipelines}
                disabled={actions.patch.isPending}
                onChange={(event) =>
                  void patch({
                    sharePipelines: event.currentTarget.checked,
                  }).catch(() => {})
                }
              />
              {connection.provider !== "local" && (
                <>
                  <Text size="xs" c="dimmed">
                    {connection.hasCredential
                      ? "A provider token is stored. Its value is never returned."
                      : "No provider token stored. Public repositories may work without one."}
                  </Text>
                  <PasswordInput
                    label={`New token for ${connection.label}`}
                    description="Write-only. Cleared after every submission, including errors."
                    autoComplete="new-password"
                    value={token}
                    onChange={(event) => setToken(event.currentTarget.value)}
                  />
                  <Group>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={!token}
                      loading={actions.patch.isPending}
                      onClick={() => {
                        const value = token;
                        setToken("");
                        void patch({ token: value }).catch(() => {});
                      }}
                    >
                      Replace token
                    </Button>
                    {connection.hasCredential && (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        loading={actions.patch.isPending}
                        onClick={() => {
                          setToken("");
                          void patch({ token: null }).catch(() => {});
                        }}
                      >
                        Remove provider token
                      </Button>
                    )}
                  </Group>
                </>
              )}
            </>
          )}
        </>
      </Stack>
      <Modal
        opened={!!edit}
        onClose={() => setEdit(null)}
        title="Edit connection settings"
        closeButtonProps={{ "aria-label": "Close connection settings" }}
      >
        {edit && (
          <Stack>
            <TextInput
              label="Connection label"
              value={edit.label}
              onChange={(event) =>
                setEdit({ ...edit, label: event.currentTarget.value })
              }
            />
            <TextInput
              label="Tracked branch"
              value={edit.branch}
              onChange={(event) =>
                setEdit({ ...edit, branch: event.currentTarget.value })
              }
            />
            <Textarea
              label="Tracked paths"
              minRows={4}
              description="One relative Markdown file or directory per line."
              value={edit.roots}
              onChange={(event) =>
                setEdit({ ...edit, roots: event.currentTarget.value })
              }
            />
            <Text size="sm" c="dimmed">
              Existing snapshots stay in history. Fetch a new snapshot to use
              these settings.
            </Text>
            {actions.patch.error && (
              <Alert color="red">{repositoryError(actions.patch.error)}</Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !edit.label.trim() ||
                  !edit.branch.trim() ||
                  !edit.roots.trim()
                }
                loading={actions.patch.isPending}
                onClick={() =>
                  void patch({
                    label: edit.label.trim(),
                    branch: edit.branch.trim(),
                    roots: edit.roots
                      .split(/\n/)
                      .map((path) => path.trim())
                      .filter(Boolean),
                  })
                    .then(() => setEdit(null))
                    .catch(() => {})
                }
              >
                Save connection settings
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Paper>
  );
}

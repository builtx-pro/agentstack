import { useState } from "react";
import { useForm } from "@mantine/form";
import { useClipboard } from "@mantine/hooks";
import {
  Alert,
  Button,
  Code,
  Group,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
  Text,
  Title,
} from "@mantine/core";
import {
  repositoryError,
  useRepositories,
  useRepositoryActions,
  type RepositoryDraft,
} from "@units/repositories";
import { RepositoryConnection } from "./repository-connection.component";
import { SnapshotPreview } from "./snapshot-preview.component";
export function Repositories({
  projectId,
  isAdmin,
}: {
  projectId: string;
  isAdmin: boolean;
}) {
  const clipboard = useClipboard();
  const query = useRepositories(projectId);
  const actions = useRepositoryActions(projectId);
  const [preview, setPreview] = useState<{
    connection: string;
    snapshot: string;
  } | null>(null);
  const [createError, setCreateError] = useState("");
  const form = useForm({
    initialValues: {
      provider: "github",
      repository: "",
      branch: "main",
      label: "",
      roots: "docs\nepics\nAGENTS.md",
      token: "",
      sharePipelines: false,
    },
    validate: {
      repository: (value) => (value.trim() ? null : "Enter a repository"),
      label: (value) => (value.trim() ? null : "Enter a connection name"),
      branch: (value) => (value.trim() ? null : "Enter a branch"),
      roots: (value) => (value.trim() ? null : "Enter at least one root"),
    },
  });
  const connection = query.data?.items.find(
    (item) => item.id === preview?.connection,
  );
  const create = async (values: typeof form.values) => {
    setCreateError("");
    const token = values.token;
    form.setFieldValue("token", "");
    try {
      const draft: RepositoryDraft = {
        provider: values.provider as RepositoryDraft["provider"],
        repository: values.repository.trim(),
        branch: values.branch.trim(),
        label: values.label.trim(),
        roots: values.roots
          .split(/\n/)
          .map((root) => root.trim())
          .filter(Boolean),
        sharePipelines: values.sharePipelines,
        ...(values.provider !== "local" && token ? { token } : {}),
      };
      const saved = await actions.create.mutateAsync(draft);
      form.setFieldValue("repository", "");
      form.setFieldValue("label", "");
      if (saved.provider !== "local") {
        const snapshot = await actions.pull.mutateAsync({
          connection: saved.id,
          expectedVersion: saved.version,
        });
        setPreview({ connection: saved.id, snapshot: snapshot.id });
      }
    } catch (error) {
      setCreateError(repositoryError(error));
    }
  };
  return (
    <Stack gap="lg">
      <div>
        <Group justify="space-between">
          <Title order={3}>Repositories</Title>
          <Button
            variant="subtle"
            size="xs"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Reload connections
          </Button>
        </Group>
        <Text c="dimmed" mt="xs">
          Bring project documents and plans from GitHub, GitLab or a local
          checkout. Fetching creates a reviewable snapshot; applying remains a
          human decision.
        </Text>
      </div>
      {isAdmin && (
        <Paper withBorder p="lg">
          <form onSubmit={form.onSubmit((values) => void create(values))}>
            <Stack>
              <Title order={4}>Connect a repository</Title>
              <SimpleGrid
                cols={{ base: 1, sm: 2 }}
                style={{ alignItems: "end" }}
              >
                <Select
                  label="Provider"
                  data={[
                    { value: "github", label: "GitHub" },
                    { value: "gitlab", label: "GitLab" },
                    { value: "local", label: "Local / CI" },
                  ]}
                  {...form.getInputProps("provider")}
                />
                <TextInput
                  label="Connection name"
                  placeholder="Product repository"
                  required
                  {...form.getInputProps("label")}
                />
              </SimpleGrid>
              <SimpleGrid
                cols={{ base: 1, sm: 2 }}
                style={{ alignItems: "end" }}
              >
                <TextInput
                  label="Repository"
                  placeholder={
                    form.values.provider === "local"
                      ? "local-project"
                      : "owner/repository"
                  }
                  description={
                    form.values.provider === "gitlab"
                      ? "Nested groups are supported."
                      : "Use its identifier, not a URL."
                  }
                  required
                  {...form.getInputProps("repository")}
                />
                <TextInput
                  label="Branch"
                  required
                  {...form.getInputProps("branch")}
                />
              </SimpleGrid>
              <Textarea
                label="Tracked roots"
                description="One relative file or directory per line. Markdown only; no globs or parent paths."
                minRows={3}
                required
                {...form.getInputProps("roots")}
              />
              {form.values.provider !== "local" && (
                <PasswordInput
                  label="Provider token"
                  description="Optional for public repositories. Write-only; never included in page links or CLI snippets."
                  autoComplete="new-password"
                  {...form.getInputProps("token")}
                />
              )}
              <Switch
                label="Share pipeline status with customers"
                {...form.getInputProps("sharePipelines", { type: "checkbox" })}
              />
              {createError && <Alert color="red">{createError}</Alert>}
              <Group justify="flex-end">
                <Button
                  type="submit"
                  loading={actions.create.isPending || actions.pull.isPending}
                >
                  Connect repository
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      )}
      {query.error ? (
        <Alert color="red">
          {repositoryError(query.error)}
          <Button
            variant="subtle"
            size="xs"
            onClick={() => void query.refetch()}
          >
            Reload connections
          </Button>
        </Alert>
      ) : query.isPending ? (
        <Text>Loading connections…</Text>
      ) : query.data?.items.length ? (
        query.data.items.map((item) => (
          <RepositoryConnection
            key={item.id}
            projectId={projectId}
            connection={item}
            isAdmin={isAdmin}
            onPreview={(snapshot) =>
              setPreview({ connection: item.id, snapshot })
            }
          />
        ))
      ) : (
        <Text c="dimmed">
          No repositories connected yet.
          {!isAdmin ? " Ask an administrator to add one." : ""}
        </Text>
      )}
      <Paper withBorder p="lg">
        <Stack>
          <Title order={4}>Local checkout and CI</Title>
          <Text size="sm">
            Use a scoped agent token from Agent connections. Supply it through
            your shell or CI secret store. Reported snapshots stay pending until
            a person reviews and applies them here.
          </Text>
          <Code
            block
          >{`AGENTSTACK_URL=https://your-instance.example\nAGENTSTACK_PROJECT=${projectId}\nAGENTSTACK_TOKEN=<from your secret store>`}</Code>
          <Code block>{`# Inspect a local checkout without creating a snapshot
node packages/cli/dist/main.js --project ${projectId} repositories sync CONNECTION_ID --repo /path/to/checkout

# Stage a reported snapshot for human review
node packages/cli/dist/main.js --project ${projectId} --timeout-ms 120000 repositories sync CONNECTION_ID --repo /path/to/checkout --stage

# Fetch a hosted repository and provider pipelines
node packages/cli/dist/main.js --project ${projectId} repositories refresh CONNECTION_ID`}</Code>
          <Button
            variant="light"
            size="xs"
            onClick={() =>
              clipboard.copy(
                `node packages/cli/dist/main.js --project ${projectId} --timeout-ms 120000 repositories sync CONNECTION_ID --repo /path/to/checkout --stage`,
              )
            }
          >
            {clipboard.copied ? "Copied" : "Copy local / CI command"}
          </Button>
          <Text size="sm" c="dimmed">
            Replace CONNECTION_ID with a connection identifier shown above.
            Commands stage snapshots; they never apply changes. These are
            placeholders. Provider tokens and session passwords are never
            exported.
          </Text>
        </Stack>
      </Paper>
      {preview && connection && (
        <SnapshotPreview
          key={`${preview.connection}:${preview.snapshot}`}
          projectId={projectId}
          connection={connection}
          snapshotId={preview.snapshot}
          onClose={() => setPreview(null)}
        />
      )}
    </Stack>
  );
}

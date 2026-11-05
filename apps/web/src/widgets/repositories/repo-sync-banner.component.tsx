import { Alert, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { usePipelines } from "@units/repositories";
import { Pipelines } from "./pipelines.component";
export function RepoSyncBanner({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const query = usePipelines(projectId);
  if (!canEdit && !query.data?.items.length) return null;
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Title order={4}>Repository sync</Title>
            <Text size="sm" c="dimmed">
              Changes arrive as a preview. A person chooses what enters the
              project.
            </Text>
          </div>
          {canEdit && (
            <Link
              to="/projects/$projectId/$section"
              params={{ projectId, section: "settings" }}
              hash="repositories"
              search={{
                q: "",
                tag: "",
                variant: "",
                palette: "",
                flow: "",
                status: "",
                kind: "",
                archived: false,
                selected: "",
              }}
            >
              Review pending changes
            </Link>
          )}
        </Group>
        {query.error ? (
          <Alert color="orange">
            Pipeline status is unavailable. Project items are unchanged.
          </Alert>
        ) : query.isPending ? (
          <Text size="sm" c="dimmed">
            Loading pipeline status…
          </Text>
        ) : query.data?.items.length ? (
          <Pipelines groups={query.data.items} />
        ) : (
          <Text size="sm" c="dimmed">
            Connect a repository or report a local checkout through CLI / CI.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

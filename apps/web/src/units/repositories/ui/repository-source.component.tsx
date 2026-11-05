import { Anchor, Badge, Code, Group, Paper, Stack, Text } from "@mantine/core";
import { IconGitBranch } from "@tabler/icons-react";
import { useRepositoryBindings } from "../service/use-repositories.hook";
import classes from "./repository-source.module.css";
function sourceLink(url?: string) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      ["github.com", "gitlab.com"].includes(parsed.hostname)
    )
      return parsed.href;
  } catch {}
  return;
}
/** Mounted by the object viewer only for project team members. */
export function RepositorySource({
  projectId,
  objectId,
  version,
}: {
  projectId: string;
  objectId: string;
  version: number;
}) {
  const query = useRepositoryBindings(projectId, objectId);
  if (query.error)
    return (
      <Text size="xs" c="dimmed" mt="md">
        Repository source is temporarily unavailable.
      </Text>
    );
  if (!query.data?.items.length) return null;
  return (
    <Paper withBorder p="sm" mt="md">
      <Group gap="xs" mb="sm">
        <IconGitBranch size={16} aria-hidden="true" />
        <Text size="sm" fw={600}>
          Repository source
        </Text>
      </Group>
      <Stack gap="sm">
        {query.data.items.map((binding) => (
          <div
            key={`${binding.connectionId}:${binding.path}`}
            className={classes.source}
          >
            {sourceLink(binding.sourceUrl) ? (
              <Anchor
                size="sm"
                href={sourceLink(binding.sourceUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {binding.label} / {binding.path}
              </Anchor>
            ) : (
              <Text size="sm">
                {binding.label} / {binding.path}
              </Text>
            )}
            <Group gap="xs" mt={5}>
              <Code>{binding.commit.slice(0, 12)}</Code>
              <Text size="xs" c="dimmed">
                Imported as v{binding.lastAppliedVersion}
              </Text>
              {version > binding.lastAppliedVersion && (
                <Badge size="xs" color="orange">
                  Workspace changed since import
                </Badge>
              )}
            </Group>
          </div>
        ))}
      </Stack>
    </Paper>
  );
}

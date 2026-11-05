import { Anchor, Badge, Group, Stack, Text } from "@mantine/core";
import type { PipelineGroup } from "@units/repositories";
const colors: Record<string, string> = {
  passed: "teal",
  failed: "red",
  running: "blue",
  queued: "orange",
  cancelled: "gray",
  skipped: "gray",
  unknown: "gray",
};
function safeLink(url?: string) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return parsed.href;
  } catch {}
  return;
}
export function Pipelines({ groups }: { groups: PipelineGroup[] }) {
  return (
    <Stack gap="md">
      {groups.map((group) => (
        <div key={group.connectionId}>
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              {group.label}
            </Text>
            <Text size="xs" c="dimmed">
              {group.lastCheckedAt
                ? `Checked ${new Date(group.lastCheckedAt).toLocaleString()}`
                : "No sync yet"}
            </Text>
          </Group>
          <Group gap="sm" mt="xs">
            {group.pipelines.map((pipeline) => (
              <Group key={pipeline.id} gap={6}>
                <Badge color={colors[pipeline.status]} variant="light">
                  {pipeline.status}
                </Badge>
                {safeLink(pipeline.url) ? (
                  <Anchor
                    href={safeLink(pipeline.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                  >
                    {pipeline.name}
                  </Anchor>
                ) : (
                  <Text size="sm">{pipeline.name}</Text>
                )}
                <Text size="xs" c="dimmed">
                  {pipeline.source === "reported"
                    ? "Reported by CI / agent"
                    : "From provider"}
                  {pipeline.commit ? ` · ${pipeline.commit.slice(0, 8)}` : ""}
                </Text>
              </Group>
            ))}
            {!group.pipelines.length && (
              <Text size="sm" c="dimmed">
                No pipeline runs reported.
              </Text>
            )}
          </Group>
        </div>
      ))}
    </Stack>
  );
}

import { useI18n } from "@shared/i18n";
import { useMediaQuery } from "@mantine/hooks";
import {
  Modal,
  Group,
  Text,
  Badge,
  Button,
  Tabs,
  Stack,
  Menu,
  Anchor,
} from "@mantine/core";
import {
  IconEdit,
  IconArchive,
  IconHistory,
  IconMessageCircle,
  IconCopy,
  IconDots,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type { ProjectObject } from "@shared/api/schemas";
import { asStrings, asString } from "@shared/lib/format.util";
import { WorkspaceService } from "@units/workspace";
import { RepositorySource } from "@units/repositories";
import { kindLabels } from "@shared/lib/labels.constant";
import { ObjectPreview } from "./object-preview.component";
import { Discussion } from "@units/review/ui/discussion.component";
import { HistoryPanel } from "./history-panel.component";
import classes from "./viewer.module.css";
export function ObjectViewer({
  object,
  objects,
  canEdit,
  onClose,
  onEdit,
  onSelect,
  onTag,
}: {
  object: ProjectObject;
  objects: ProjectObject[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSelect: (id: string) => void;
  onTag: (tag: string, object: ProjectObject) => void;
}) {
  const { t } = useI18n();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const mutation = WorkspaceService.useWorkspaceMutation(object.projectId);
  const usage = objects.filter(
    (o) =>
      o.kind === "screen" && asStrings(o.data.assetIds).includes(object.id),
  );
  return (
    <Modal
      opened
      fullScreen={isMobile}
      onClose={onClose}
      size="min(1320px, 96vw)"
      title={
        <Group gap="sm">
          <Badge>{t(kindLabels[object.kind])}</Badge>
          <Text fw={650}>{object.title}</Text>
        </Group>
      }
    >
      <Stack>
        <Group justify="space-between">
          <Group gap={6}>
            {object.tags.map((tag) => (
              <Badge
                key={tag}
                component="button"
                type="button"
                className={classes.tagButton}
                onClick={() => onTag(tag, object)}
                color="gray"
                size="sm"
              >
                {tag}
              </Badge>
            ))}
            <Text size="xs" c="dimmed">
              {object.key} · v{object.version}
            </Text>
            {object.archived && <Badge color="orange">{t("Archived")}</Badge>}
          </Group>
          <Group gap="xs">
            {canEdit && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconEdit size={15} />}
                onClick={onEdit}
              >
                {t("Edit")}
              </Button>
            )}
            <Menu position="bottom-end">
              <Menu.Target>
                <Button
                  size="xs"
                  variant="default"
                  aria-label={t("More object actions")}
                >
                  <IconDots size={17} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconCopy size={15} />}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(
                        `Review ${t(kindLabels[object.kind])}: ${object.title}
Project: ${object.projectId}
Target ID: ${object.id}
Key: ${object.key}
Revision: ${object.version}
Source: ${asString(object.data.sourcePath)}
URL: ${location.href}
Read current notes and project rules through AgentStack before editing. Submit evidence; leave acceptance to a human.`,
                      )
                      .then(() =>
                        notifications.show({
                          message: t("Agent context copied"),
                        }),
                      )
                      .catch(() =>
                        notifications.show({
                          color: "red",
                          message: t(
                            "Could not copy. Use your browser to copy the page URL.",
                          ),
                        }),
                      )
                  }
                >
                  {t("Copy context for agent")}
                </Menu.Item>
                {canEdit && (
                  <Menu.Item
                    color="orange"
                    leftSection={<IconArchive size={15} />}
                    onClick={() =>
                      mutation.mutate({
                        path: `/projects/${object.projectId}/objects/${object.id}`,
                        method: "PATCH",
                        body: {
                          expectedVersion: object.version,
                          archived: !object.archived,
                        },
                      })
                    }
                  >
                    {t(object.archived ? "Unarchive" : "Archive")}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
        <Tabs defaultValue="review">
          <Tabs.List mb="lg">
            <Tabs.Tab
              value="review"
              leftSection={<IconMessageCircle size={16} />}
            >
              {t("Review")}
            </Tabs.Tab>
            <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
              {t("Versions & history")}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="review">
            <div className={classes.layout}>
              <div className={classes.visual}>
                <ObjectPreview
                  key={`preview-${object.id}`}
                  object={object}
                  canEdit={canEdit}
                />
                {canEdit && (
                  <RepositorySource
                    key={object.id}
                    projectId={object.projectId}
                    objectId={object.id}
                    version={object.version}
                  />
                )}
                {usage.length > 0 && (
                  <Stack mt="lg" gap={6}>
                    <Text fw={600} size="sm">
                      {t("Used on {count} screens", { count: usage.length })}
                    </Text>
                    {usage.map((screen) => (
                      <Anchor
                        key={screen.id}
                        component="button"
                        size="sm"
                        onClick={() => onSelect(screen.id)}
                      >
                        {screen.title}
                      </Anchor>
                    ))}
                  </Stack>
                )}
                {object.kind === "flow" && (
                  <Stack mt="md">
                    {asStrings(object.data.screenIds).map((id, index) => (
                      <Button
                        key={id}
                        variant="default"
                        onClick={() => onSelect(id)}
                      >
                        {index + 1}.{" "}
                        {objects.find((o) => o.id === id)?.title ??
                          t("Unavailable screen")}
                      </Button>
                    ))}
                    {asStrings(object.data.stateIds).length > 0 && (
                      <Text fw={600} size="sm" mt="md">
                        {t("Alternate states")}
                      </Text>
                    )}
                    {asStrings(object.data.stateIds).map((id) => (
                      <Button
                        key={id}
                        variant="light"
                        onClick={() => onSelect(id)}
                      >
                        {objects.find((o) => o.id === id)?.title ??
                          t("Unavailable state")}
                      </Button>
                    ))}
                  </Stack>
                )}
              </div>
              <aside className={classes.discussion}>
                <Discussion
                  key={object.id}
                  projectId={object.projectId}
                  target={object}
                  canEdit={canEdit}
                />
              </aside>
            </div>
          </Tabs.Panel>
          <Tabs.Panel value="history">
            <HistoryPanel object={object} canEdit={canEdit} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Modal>
  );
}

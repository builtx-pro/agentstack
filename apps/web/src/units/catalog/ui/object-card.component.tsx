import type { MouseEvent } from "react";
import { useI18n } from "@shared/i18n";
import { Text, Group, Badge, Button } from "@mantine/core";
import { IconMessageCircle, IconArrowUpRight } from "@tabler/icons-react";
import type { ProjectObject } from "@shared/api/schemas";
import { ObjectPreview } from "./object-preview.component";
import classes from "./viewer.module.css";
export function ObjectCard({
  object,
  noteCount,
  onOpen,
  onTag,
}: {
  object: ProjectObject;
  noteCount: number;
  onOpen: () => void;
  onTag: (tag: string, object: ProjectObject) => void;
}) {
  const { t } = useI18n();
  const openViewer = (event: MouseEvent<HTMLButtonElement>) => {
    // WebKit does not focus a button on pointer activation.
    event.currentTarget.focus({ preventScroll: true });
    onOpen();
  };
  return (
    <article
      className={classes.card}
      data-frame={
        object.kind === "screen"
          ? object.data.frame === "desktop"
            ? "desktop"
            : "mobile"
          : "asset"
      }
    >
      <button
        type="button"
        className={classes.cardPreview}
        onClick={openViewer}
        aria-label={t("Review {title}", { title: object.title })}
      >
        <ObjectPreview object={object} compact />
      </button>
      <div className={classes.cardMeta}>
        <Text fw={650} lineClamp={1}>
          {object.title}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={1}>
          {object.key} · v{object.version}
        </Text>
        <div className={classes.cardTags}>
          {object.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              component="button"
              type="button"
              className={classes.tagButton}
              onClick={() => onTag(tag, object)}
              size="xs"
              color="gray"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      <div className={classes.cardFooter}>
        <Group gap={5}>
          <IconMessageCircle size={15} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            {noteCount
              ? t("Notes: {count}", { count: noteCount })
              : t("No notes")}
          </Text>
        </Group>
        <Button
          variant="subtle"
          rightSection={<IconArrowUpRight size={14} />}
          onClick={openViewer}
        >
          {t("Review")}
        </Button>
      </div>
    </article>
  );
}

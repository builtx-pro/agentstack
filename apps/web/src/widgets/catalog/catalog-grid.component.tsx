import classes from "./catalog.module.css";
import { useI18n } from "@shared/i18n";
import { Stack, Button, Text, Group } from "@mantine/core";
import type { ProjectObject } from "@shared/api/schemas";
import { ObjectCard } from "@units/catalog/ui/object-card.component";
import { useCatalogWindow } from "@units/catalog/service/use-catalog-window.hook";
export function CatalogGrid({
  objects,
  counts,
  windowKey,
  onOpen,
  onTag,
}: {
  objects: ProjectObject[];
  counts: Map<string, number>;
  windowKey: string;
  onOpen: (id: string) => void;
  onTag: (tag: string, object: ProjectObject) => void;
}) {
  const { t } = useI18n();
  const window = useCatalogWindow(objects, windowKey, 48);
  return (
    <Stack>
      <div className={classes.grid}>
        {window.items.map((object) => (
          <ObjectCard
            onTag={onTag}
            key={object.id}
            object={object}
            noteCount={counts.get(object.id) ?? 0}
            onOpen={() => onOpen(object.id)}
          />
        ))}
      </div>
      {window.hasMore && (
        <Group justify="center" py="md">
          <Text size="sm" c="dimmed">
            {t("Showing {shown} of {total}", {
              shown: window.shown,
              total: objects.length,
            })}
          </Text>
          <Button variant="light" onClick={window.showMore}>
            {t("Load 48 more")}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

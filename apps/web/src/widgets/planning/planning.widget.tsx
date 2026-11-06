import { useMemo, useCallback } from "react";
import {
  Stack,
  Group,
  TextInput,
  Select,
  Switch,
  Text,
  Button,
  Badge,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import type {
  ProjectObject,
  ProgressData,
  ObjectKind,
} from "@shared/api/schemas";
import { useI18n } from "@shared/i18n";
import { kindLabels, statusLabels } from "@shared/lib/labels.constant";
import { EmptyState } from "@shared/ui/empty-state.component";
import { WorkspaceService } from "@units/workspace";
import { useCatalogFilters } from "@units/catalog/service/use-catalog.hook";
import { useCatalogWindow } from "@units/catalog/service/use-catalog-window.hook";
import { useLoadMore } from "@units/catalog/service/use-load-more.hook";
import { filterObjects } from "@units/catalog/lib/catalog.util";
import { tagFilter } from "@units/catalog/lib/tag-filter.util";
import { RepoSyncBanner } from "../repositories/repo-sync-banner.component";
import { PlanningCard } from "./planning-card.component";
import { planningRoots } from "./planning.util";
import classes from "./planning.module.css";
export function Planning({
  projectId,
  objects,
  kinds,
  progress,
  onOpen,
  canEdit,
}: {
  projectId: string;
  objects: ProjectObject[];
  kinds: ObjectKind[];
  progress?: ProgressData;
  onOpen: (id: string) => void;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const { filters, searchInput, setSearch, clearSearch, update } =
    useCatalogFilters();
  const scope = useMemo(
    () => objects.filter((o) => kinds.includes(o.kind)),
    [objects, kinds],
  );
  const visible = filterObjects(scope, filters);
  const roots =
    filters.q || filters.tag || filters.status || filters.kind
      ? visible
      : planningRoots(visible);
  const windowKey = JSON.stringify({ ...filters, selected: undefined });
  const window = useCatalogWindow(roots, windowKey, 20);
  const load = useCallback(window.showMore, [
    window.shown,
    roots.length,
    windowKey,
  ]);
  const sentinel = useLoadMore(window.hasMore, load);
  const mutation = WorkspaceService.useWorkspaceMutation(projectId);
  const selectTag = (tag: string, object: ProjectObject) => {
    clearSearch();
    update(tagFilter(tag, object.kind, object.archived));
  };
  return (
    <Stack gap="lg">
      {kinds.includes("sprint") && (
        <RepoSyncBanner projectId={projectId} canEdit={canEdit} />
      )}
      <div className={classes.toolbar}>
        <TextInput
          aria-label={t("Search project items")}
          placeholder={t("Search titles, descriptions and tags…")}
          leftSection={<IconSearch size={18} />}
          value={searchInput}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Select
          aria-label={t("Item type")}
          placeholder={t("All types")}
          clearable
          data={kinds.map((value) => ({ value, label: t(kindLabels[value]) }))}
          value={filters.kind || null}
          onChange={(value) => update({ kind: value ?? "" })}
        />
        <Select
          aria-label={t("Status filter")}
          placeholder={t("All statuses")}
          clearable
          data={["backlog", "ready", "in_progress", "review", "done"].map(
            (value) => ({ value, label: t(statusLabels[value]) }),
          )}
          value={filters.status || null}
          onChange={(value) => update({ status: value ?? "" })}
        />
        <Select
          aria-label={t("Filter by tag")}
          placeholder={t("All tags")}
          clearable
          searchable
          data={[...new Set(scope.flatMap((o) => o.tags))].sort()}
          value={filters.tag || null}
          onChange={(value) => update({ tag: value ?? "" })}
        />
      </div>
      {filters.tag && (
        <Group gap="xs">
          <Badge>{t("Tag: {tag}", { tag: filters.tag })}</Badge>
          <Button variant="subtle" onClick={() => update({ tag: "" })}>
            {t("Clear tag filter")}
          </Button>
        </Group>
      )}
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t("Showing {shown} of {total}", {
            shown: window.shown,
            total: roots.length,
          })}
        </Text>
        <Switch
          label={t("Show archive")}
          checked={filters.archived}
          onChange={(event) =>
            update({ archived: event.currentTarget.checked })
          }
        />
      </Group>
      {roots.length === 0 ? (
        <EmptyState
          title={t("Make the plan visible")}
          description={t(
            "Add a document, delivery item or proposal. Your team and agents will share the same versioned context.",
          )}
        />
      ) : (
        <ul className={classes.list}>
          {window.items.map((object) => (
            <li key={object.id}>
              <PlanningCard
                object={object}
                objects={objects}
                progress={progress}
                onOpen={onOpen}
                onTag={selectTag}
                converting={mutation.isPending}
                onConvert={
                  canEdit
                    ? (object) =>
                        mutation.mutate({
                          path: `/projects/${projectId}/objects/${object.id}/convert`,
                          body: { expectedVersion: object.version },
                        })
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
      {window.hasMore && (
        <div ref={sentinel} className={classes.sentinel}>
          <Button variant="default" onClick={load}>
            {t("Load more items")}
          </Button>
        </div>
      )}
    </Stack>
  );
}

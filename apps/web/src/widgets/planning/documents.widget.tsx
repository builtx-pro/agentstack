import { useCallback } from "react";
import {
  Stack,
  Group,
  TextInput,
  Select,
  Switch,
  Text,
  Button,
  Tabs,
  Skeleton,
  Alert,
} from "@mantine/core";
import { IconSearch, IconFileText, IconShieldCheck } from "@tabler/icons-react";
import type { ProjectObject } from "@shared/api/schemas";
import { useI18n } from "@shared/i18n";
import { statusLabels } from "@shared/lib/labels.constant";
import { EmptyState } from "@shared/ui/empty-state.component";
import { errorMessage } from "@shared/i18n/error-message.util";
import { useCatalogFilters } from "@units/catalog/service/use-catalog.hook";
import { useLoadMore } from "@units/catalog/service/use-load-more.hook";
import { PlanningCard } from "./planning-card.component";
import classes from "./planning.module.css";
export interface DocumentContinuation {
  hasMore: boolean;
  fetching: boolean;
  refreshing: boolean;
  stale: boolean;
  error: Error | null;
  load: () => void;
  retry: () => void;
}
export function Documents({
  objects,
  onOpen,
  canEdit,
  pagination,
}: {
  objects: ProjectObject[];
  onOpen: (id: string) => void;
  canEdit: boolean;
  pagination: DocumentContinuation;
}) {
  const { t } = useI18n();
  const { filters, searchInput, setSearch, clearSearch, update } =
    useCatalogFilters();
  const kind = filters.kind === "rule" && canEdit ? "rule" : "document";
  const load = useCallback(() => pagination.load(), [pagination.load]);
  const sentinel = useLoadMore(
    pagination.hasMore &&
      !pagination.fetching &&
      !pagination.refreshing &&
      !pagination.stale &&
      !pagination.error,
    load,
  );
  return (
    <Stack gap="lg">
      <Tabs
        value={kind}
        onChange={(value) =>
          update({
            kind: value === "rule" ? "rule" : "document",
            selected: "",
            q: "",
            tag: "",
          })
        }
      >
        <Tabs.List aria-label={t("Knowledge sections")}>
          <Tabs.Tab value="document" leftSection={<IconFileText size={18} />}>
            {t("Documents")}
          </Tabs.Tab>
          {canEdit && (
            <Tabs.Tab value="rule" leftSection={<IconShieldCheck size={18} />}>
              {t("Agent rules")}
            </Tabs.Tab>
          )}
        </Tabs.List>
      </Tabs>
      <div className={classes.toolbar}>
        <TextInput
          aria-label={t("Search project items")}
          placeholder={t("Search titles, descriptions and tags…")}
          leftSection={<IconSearch size={18} />}
          value={searchInput}
          onChange={(event) => setSearch(event.currentTarget.value)}
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
        <TextInput
          aria-label={t("Filter by tag")}
          placeholder={t("Exact tag · Enter to apply")}
          key={filters.tag}
          defaultValue={filters.tag}
          onBlur={(event) => {
            if (event.currentTarget.value !== filters.tag)
              update({ tag: event.currentTarget.value.trim() });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter")
              update({ tag: event.currentTarget.value.trim() });
          }}
        />
        <Switch
          label={t("Show archive")}
          checked={filters.archived}
          onChange={(event) =>
            update({ archived: event.currentTarget.checked })
          }
        />
      </div>
      <Group justify="space-between">
        <Text size="sm" c="dimmed" role="status">
          {pagination.refreshing
            ? t("Refreshing results…")
            : t("{count} items loaded", { count: objects.length })}
        </Text>
        {filters.tag && (
          <Button variant="subtle" onClick={() => update({ tag: "" })}>
            {t("Clear tag filter")}
          </Button>
        )}
      </Group>
      {objects.length === 0 && !pagination.refreshing && !pagination.error && (
        <EmptyState
          illustration="knowledge"
          title={t("No documents found")}
          description={t(
            "Try another filter or add the first item to this project.",
          )}
        />
      )}
      <ul
        className={classes.list}
        aria-busy={pagination.refreshing || pagination.fetching}
      >
        {objects.map((object) => (
          <li key={object.id}>
            <PlanningCard
              object={object}
              objects={objects}
              onOpen={onOpen}
              onTag={(tag, target) => {
                clearSearch();
                update({ tag, q: "", kind: target.kind, selected: "" });
              }}
            />
          </li>
        ))}
      </ul>
      {pagination.fetching && (
        <Stack
          role="status"
          aria-label={t("Loading more items…")}
          aria-busy="true"
        >
          {[0, 1, 2].map((value) => (
            <Skeleton key={value} h={130} radius="lg" />
          ))}
        </Stack>
      )}
      {pagination.error && (
        <Alert color="red" title={t("We couldn't load this")}>
          <Stack>
            <Text>{errorMessage(pagination.error)}</Text>
            <Button variant="default" onClick={pagination.retry}>
              {t("Try again")}
            </Button>
          </Stack>
        </Alert>
      )}
      {pagination.hasMore && !pagination.error && (
        <div ref={sentinel} className={classes.sentinel}>
          <Button
            variant="default"
            loading={pagination.fetching}
            disabled={pagination.refreshing || pagination.stale}
            onClick={load}
          >
            {t("Load more items")}
          </Button>
        </div>
      )}
    </Stack>
  );
}

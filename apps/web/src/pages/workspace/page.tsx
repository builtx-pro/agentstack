import { useI18n } from "@shared/i18n";
import { Navigate, useParams } from "@tanstack/react-router";
import { Stack, Group, Title, Text, Button, Menu, Alert } from "@mantine/core";
import { IconPlus, IconChevronDown } from "@tabler/icons-react";
import { Shell } from "@widgets/shell/shell.widget";
import { Catalog } from "@widgets/catalog/catalog.widget";
import { Reviews } from "@widgets/reviews/reviews.widget";
import { Documents } from "@widgets/planning/documents.widget";
import { Planning } from "@widgets/planning/planning.widget";
import { Dashboard } from "@widgets/dashboard/dashboard.widget";
import { ActivityFeed } from "@widgets/activity/activity.widget";
import { Settings } from "@widgets/settings/settings.widget";
import { ObjectViewer } from "@units/catalog/ui/object-viewer.component";
import { ObjectEditor } from "@units/catalog/ui/object-editor.component";
import { QueryState } from "@shared/ui/query-state.component";
import { sectionInfo, kindLabels } from "@shared/lib/labels.constant";
import type { ObjectKind } from "@shared/api/schemas";
import { useWorkspacePage } from "./use-workspace-page.hook";
export function WorkspacePage() {
  const { projectId } = useParams({ from: "/projects/$projectId/$section" });
  return <ProjectWorkspace key={projectId} />;
}
function ProjectWorkspace() {
  const { t } = useI18n();
  const vm = useWorkspacePage();
  if (vm.auth.isPending) return <QueryState pending />;
  if (!vm.auth.data) return <Navigate to="/login" />;
  if (!vm.project.data)
    return (
      <QueryState
        pending={vm.project.isPending}
        error={vm.project.error}
        retry={() => void vm.project.refetch()}
      />
    );
  return (
    <Shell
      user={vm.auth.data.user}
      project={vm.project.data}
      projects={vm.projects.data}
      section={vm.section}
    >
      <Stack gap="xl">
        <Group justify="space-between" align="start">
          <div>
            <Text size="xs" c="dimmed" fw={600} mb={6}>
              {vm.project.data.name}
            </Text>
            <Title order={1}>{t(sectionInfo[vm.section][0])}</Title>
            <Text c="dimmed" mt="xs">
              {t(sectionInfo[vm.section][1])}
            </Text>
          </div>
          {vm.canEdit && (
            <Menu position="bottom-end">
              <Menu.Target>
                <Button
                  leftSection={<IconPlus size={17} />}
                  rightSection={<IconChevronDown size={14} />}
                >
                  {t("Add new")}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {(Object.keys(kindLabels) as ObjectKind[])
                  .filter(
                    (kind) =>
                      vm.section !== "documents" ||
                      kind === "document" ||
                      kind === "rule",
                  )
                  .map((kind) => (
                    <Menu.Item
                      key={kind}
                      onClick={() => vm.setEditor({ kind })}
                    >
                      {t(kindLabels[kind])}
                    </Menu.Item>
                  ))}
              </Menu.Dropdown>
            </Menu>
          )}
          {!vm.canEdit && vm.section === "features" && (
            <Button
              leftSection={<IconPlus size={17} />}
              onClick={() => vm.setEditor({ kind: "proposal" })}
            >
              {t("Suggest an improvement")}
            </Button>
          )}
        </Group>
        <QueryState
          pending={vm.objects.isPending}
          error={vm.objects.error}
          retry={() => void vm.objects.refetch()}
        />
        {vm.objects.data && (
          <>
            {vm.section === "overview" && (
              <>
                <QueryState
                  pending={vm.progress.isPending}
                  error={vm.progress.error}
                />
                {vm.progress.data && (
                  <Dashboard
                    project={vm.project.data}
                    objects={vm.objects.data}
                    progress={vm.progress.data}
                    onOpen={vm.select}
                    onSection={vm.goSection}
                    onTag={vm.filterTag}
                  />
                )}
              </>
            )}
            {vm.section === "screens" && (
              <Catalog
                onTag={vm.filterTag}
                kind="screen"
                objects={vm.objects.data}
                notes={vm.notes.data ?? []}
                canEdit={vm.canEdit}
                onOpen={vm.select}
                onCreate={() => vm.setEditor({ kind: "screen" })}
              />
            )}
            {vm.section === "assets" && (
              <Catalog
                onTag={vm.filterTag}
                kind="asset"
                objects={vm.objects.data}
                notes={vm.notes.data ?? []}
                canEdit={vm.canEdit}
                onOpen={vm.select}
                onCreate={() => vm.setEditor({ kind: "asset" })}
              />
            )}
            {vm.section === "reviews" && (
              <>
                <QueryState
                  pending={vm.notes.isPending}
                  error={vm.notes.error}
                />
                <Reviews
                  projectId={vm.projectId}
                  objects={vm.objects.data}
                  notes={vm.notes.data ?? []}
                  canEdit={vm.canEdit}
                  onOpen={vm.select}
                />
              </>
            )}
            {vm.section === "documents" && (
              <Documents
                objects={vm.objects.data}
                canEdit={vm.canEdit}
                onOpen={vm.select}
                pagination={vm.documentPagination}
              />
            )}
            {vm.section === "plan" && (
              <Planning
                projectId={vm.projectId}
                objects={vm.objects.data}
                kinds={["wave", "epic", "story", "sprint"]}
                progress={vm.progress.data}
                canEdit={vm.canEdit}
                onOpen={vm.select}
              />
            )}
            {vm.section === "features" && (
              <Planning
                projectId={vm.projectId}
                objects={vm.objects.data}
                kinds={["feature", "proposal"]}
                progress={vm.progress.data}
                canEdit={vm.canEdit}
                onOpen={vm.select}
              />
            )}
            {vm.section === "history" && (
              <ActivityFeed projectId={vm.projectId} onOpen={vm.select} />
            )}
            {vm.section === "settings" &&
              (vm.canEdit ? (
                <Settings
                  key={vm.projectId}
                  project={vm.project.data}
                  isAdmin={vm.auth.data.user.isAdmin}
                />
              ) : (
                <Alert color="gray">
                  {t("Project settings are managed by your team.")}
                </Alert>
              ))}
          </>
        )}
        {vm.selectedPending && <QueryState pending />}
        {vm.selectedError && (
          <QueryState
            error={vm.selectedError}
            retry={() => void vm.selectedRetry()}
          />
        )}
        {vm.filters.selected &&
          !vm.selected &&
          !vm.objects.isPending &&
          !vm.selectedPending &&
          !vm.selectedError && (
            <Alert color="orange" title={t("This item is unavailable")}>
              {t("It may have been archived or you may not have access.")}{" "}
              <Button size="xs" variant="subtle" onClick={() => vm.select("")}>
                {t("Dismiss")}
              </Button>
            </Alert>
          )}
      </Stack>
      {vm.selected && !vm.editor && (
        <ObjectViewer
          onTag={vm.filterTag}
          object={vm.selected}
          objects={vm.objects.data ?? []}
          canEdit={vm.canEdit}
          onClose={() => vm.select("")}
          onSelect={vm.select}
          onEdit={() =>
            vm.setEditor({ kind: vm.selected!.kind, object: vm.selected })
          }
        />
      )}
      {vm.editor && (
        <ObjectEditor
          key={vm.editor.object?.id ?? vm.editor.kind}
          projectId={vm.projectId}
          object={vm.editor.object}
          kind={vm.editor.kind}
          objects={vm.objects.data ?? []}
          onClose={() => vm.setEditor(null)}
        />
      )}
    </Shell>
  );
}

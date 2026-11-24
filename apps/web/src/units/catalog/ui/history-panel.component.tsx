import { translate as t, useI18n } from "@shared/i18n";
import {
  Stack,
  Group,
  Select,
  Text,
  Button,
  Textarea,
  Paper,
  Title,
  Alert,
} from "@mantine/core";
import { useState } from "react";
import type { ProjectObject } from "@shared/api/schemas";
import { WorkspaceService } from "@units/workspace";
import { formatDate } from "@shared/lib/format.util";
import { QueryState } from "@shared/ui/query-state.component";
import { ObjectPreview } from "./object-preview.component";
import { RevisionDiff } from "./revision-diff.component";
import { RevisionNotes } from "./revision-notes.component";
import { revisionNotes } from "../lib/revision-diff.util";
import {
  designVersion,
  platformNames,
  stateLabels,
} from "../lib/screen-build.util";
import classes from "./viewer.module.css";
export function HistoryPanel({
  object,
  canEdit,
}: {
  object: ProjectObject;
  canEdit: boolean;
}) {
  useI18n();
  const history = WorkspaceService.useHistory(object.projectId, object.id);
  const notes = WorkspaceService.useNotes(object.projectId, object.id);
  const mutation = WorkspaceService.useWorkspaceMutation(object.projectId);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const revisions = (history.data ?? [])
    .slice()
    .sort((a, b) => b.version - a.version);
  const selectedVersion =
    selected ??
    String(
      (object.kind === "screen"
        ? revisions.find(
            (r) => designVersion(r.snapshot) !== designVersion(object),
          )?.version
        : undefined) ??
        revisions.find((r) => r.version !== object.version)?.version ??
        revisions[0]?.version ??
        "",
    );
  const revision = revisions.find((r) => String(r.version) === selectedVersion);
  return (
    <Stack>
      <QueryState pending={history.isPending} error={history.error} />
      <Select
        label={t("Compare a previous revision with the current version")}
        placeholder={t("Choose a revision")}
        data={revisions.map((r) => ({
          value: String(r.version),
          label: `${r.snapshot.kind === "screen" ? t("Design v{version}", { version: designVersion(r.snapshot) }) + " · " : ""}v${r.version} · ${r.actorName} · ${formatDate(r.createdAt)}`,
        }))}
        value={selectedVersion || null}
        onChange={setSelected}
      />
      {revision && (
        <>
          <RevisionDiff previous={revision.snapshot} current={object} />
          <QueryState
            pending={notes.isPending}
            error={notes.error}
            retry={() => void notes.refetch()}
          />
          <div className={classes.historyGrid}>
            <Paper withBorder p="md">
              <Text size="xs" c="dimmed" mb="sm">
                {t("VERSION")} {revision.version} · {t(revision.source)}
              </Text>
              <Title order={4} mb="md">
                {revision.snapshot.title}
              </Title>
              {revision.snapshot.kind === "screen" && (
                <DesignSnapshot screen={revision.snapshot} />
              )}
              <ObjectPreview object={revision.snapshot} />
              <Text size="xs" c="dimmed" mt="md">
                {revision.summary}
              </Text>
              {notes.data && (
                <RevisionNotes
                  notes={revisionNotes(notes.data, object.id, revision.version)}
                  version={revision.version}
                />
              )}
            </Paper>
            <Paper withBorder p="md">
              <Text size="xs" c="dimmed" mb="sm">
                {t("CURRENT · VERSION")} {object.version}
              </Text>
              <Title order={4} mb="md">
                {object.title}
              </Title>
              {object.kind === "screen" && <DesignSnapshot screen={object} />}
              <ObjectPreview object={object} />
              {notes.data && (
                <RevisionNotes
                  notes={revisionNotes(notes.data, object.id, object.version)}
                  version={object.version}
                />
              )}
            </Paper>
          </div>
          {canEdit && revision.version !== object.version && (
            <>
              <Alert color="violet">
                {t(
                  "Restore creates a new version. It preserves the current permissions, status and review decisions.",
                )}
              </Alert>
              <Textarea
                label={t("Why restore this content?")}
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                required
              />
              <Group justify="flex-end">
                <Button
                  variant="light"
                  disabled={!reason.trim()}
                  loading={mutation.isPending}
                  onClick={() =>
                    mutation.mutate(
                      {
                        path: `/projects/${object.projectId}/objects/${object.id}/restore`,
                        body: {
                          expectedVersion: object.version,
                          revisionVersion: revision.version,
                          reason,
                        },
                      },
                      { onSuccess: () => setReason("") },
                    )
                  }
                >
                  {t("Restore as new version")}
                </Button>
              </Group>
            </>
          )}
        </>
      )}
      {!history.isPending && history.data?.length === 0 && (
        <Text c="dimmed">{t("No revision history is available.")}</Text>
      )}
    </Stack>
  );
}

function DesignSnapshot({ screen }: { screen: ProjectObject }) {
  const { t } = useI18n();
  return (
    <Stack gap={2} mb="sm">
      <Text size="sm" fw={600}>
        {t("Design v{version}", { version: designVersion(screen) })}
      </Text>
      {screen.implementations?.length ? (
        screen.implementations.map((report) => (
          <Text key={report.platform} size="xs">
            {platformNames[report.platform]} · {t(stateLabels[report.state])} ·{" "}
            {t("Design v{version}", { version: report.designVersion })}
            {report.state !== "design_only" && (
              <>
                {" "}
                ·{" "}
                <a
                  href={report.evidenceUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("Build {build}", { build: report.build })}
                </a>
              </>
            )}
          </Text>
        ))
      ) : (
        <Text size="xs" c="dimmed">
          {t("No build evidence")}
        </Text>
      )}
    </Stack>
  );
}

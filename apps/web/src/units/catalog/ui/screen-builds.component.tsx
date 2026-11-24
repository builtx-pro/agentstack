import { useRef, useState } from "react";
import {
  Anchor,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { ProjectObject } from "@shared/api/schemas";
import { useI18n } from "@shared/i18n";
import { formatDate } from "@shared/lib/format.util";
import { WorkspaceService } from "@units/workspace";
import {
  buildSummary,
  designVersion,
  platformNames,
  stateLabels,
} from "../lib/screen-build.util";
import { ScreenBuildForm } from "./screen-build-form.component";

export function ScreenBuilds({
  screen,
  canEdit,
}: {
  screen: ProjectObject;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const latest = WorkspaceService.useObject(screen.projectId, screen.id, false);
  const current =
    latest.data && latest.data.version > screen.version ? latest.data : screen;
  const version = designVersion(current);
  const finish = (didSave: boolean) => {
    setEditing(false);
    setSaved(didSave);
    requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
  };
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t("Design v{version}", { version })}</Title>
        {canEdit && !editing && (
          <Button
            ref={trigger}
            variant="light"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            {t("Record implementation")}
          </Button>
        )}
      </Group>
      {saved && (
        <Text role="status" size="sm">
          {t("Build report saved.")}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        {Object.entries(platformNames).map(([platform, name]) => {
          const report = current.implementations?.find(
            (item) => item.platform === platform,
          );
          return (
            <Paper
              key={platform}
              component="section"
              aria-label={name}
              withBorder
              p="md"
              style={{ overflowWrap: "anywhere", minWidth: 0 }}
            >
              <Stack gap={6}>
                <Title order={4}>{name}</Title>
                {report ? (
                  <>
                    {report.state !== "design_only" &&
                      version > report.designVersion && (
                        <Text fw={600}>{buildSummary(report, version)}</Text>
                      )}
                    <Text>{t(stateLabels[report.state])}</Text>
                    <Text size="sm">
                      {t("Design v{version}", {
                        version: report.designVersion,
                      })}
                      {report.state !== "design_only" &&
                        ` · ${t("Build {build}", { build: report.build })}`}
                    </Text>
                    {report.state !== "design_only" && (
                      <>
                        {report.commit && (
                          <Text size="sm">
                            {t("Git commit")} <code>{report.commit}</code>
                          </Text>
                        )}
                        <Anchor
                          href={report.evidenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="sm"
                        >
                          {t("View evidence")}
                        </Anchor>
                      </>
                    )}
                    <Text size="xs" c="dimmed">
                      {t(
                        report.source === "agent"
                          ? "Reported by agent {name}"
                          : "Reported by {name}",
                        { name: report.actorName },
                      )}{" "}
                      ·{" "}
                      <time dateTime={report.reportedAt}>
                        {formatDate(report.reportedAt)}
                      </time>
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    {t("No build evidence")}
                  </Text>
                )}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
      {editing && canEdit && (
        <ScreenBuildForm
          screen={current}
          onClose={finish}
          refresh={async () => {
            const result = await latest.refetch({ throwOnError: true });
            return result.data!;
          }}
        />
      )}
    </Stack>
  );
}

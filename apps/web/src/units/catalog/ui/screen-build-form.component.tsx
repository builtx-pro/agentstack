import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  NativeSelect,
  Paper,
  SimpleGrid,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import type { ScreenImplementation } from "@agentstack/contracts";
import { screenImplementationSchema } from "@agentstack/contracts";
import type { ProjectObject } from "@shared/api/schemas";
import { ApiError } from "@shared/api/client";
import { errorMessage } from "@shared/i18n/error-message.util";
import { useI18n } from "@shared/i18n";
import { WorkspaceService } from "@units/workspace";
import {
  designVersion,
  platformNames,
  stateLabels,
} from "../lib/screen-build.util";

export function ScreenBuildForm({
  screen,
  onClose,
  refresh,
}: {
  screen: ProjectObject;
  onClose: (saved: boolean) => void;
  refresh: () => Promise<ProjectObject>;
}) {
  const { t } = useI18n();
  const saveError = useRef<HTMLDivElement>(null);
  const mutation = WorkspaceService.useWorkspaceMutation(
    screen.projectId,
    () => {
      requestAnimationFrame(() => saveError.current?.focus());
    },
  );
  const history = WorkspaceService.useHistory(screen.projectId, screen.id);
  const [baseVersion, setBaseVersion] = useState(screen.version);
  const [version, setVersion] = useState(designVersion(screen));
  const [platform, setPlatform] =
    useState<ScreenImplementation["platform"]>("android");
  const [state, setState] = useState<ScreenImplementation["state"] | "">("");
  const [build, setBuild] = useState("");
  const [commit, setCommit] = useState("");
  const [link, setLink] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadError, setReloadError] = useState<unknown>(null);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const versions = [
    ...new Set([
      version,
      designVersion(screen),
      ...(history.data ?? []).map((r) => designVersion(r.snapshot)),
    ]),
  ].sort((a, b) => b - a);
  const report = screenImplementationSchema.safeParse(
    state === "design_only"
      ? { platform, state, designVersion: version }
      : {
          platform,
          state,
          designVersion: version,
          build: build.trim(),
          commit: commit.trim() || undefined,
          evidenceUrl: link.trim(),
        },
  );
  const errors =
    invalid && !report.success
      ? report.error.issues.map((issue) => issue.path[0])
      : [];
  const conflict =
    mutation.error instanceof ApiError && mutation.error.status === 409;
  async function reload() {
    setRefreshing(true);
    setReloadError(null);
    try {
      const fresh = await refresh();
      setBaseVersion(fresh.version);
      mutation.reset();
    } catch (error) {
      setReloadError(error);
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <Paper
      component="form"
      withBorder
      p="md"
      aria-label={t("Record implementation")}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setInvalid(true);
        if (!report.success) {
          const form = e.currentTarget;
          requestAnimationFrame(() =>
            form
              .querySelector<HTMLElement>(
                '[aria-invalid="true"], [data-error="true"] input',
              )
              ?.focus(),
          );
          return;
        }
        if (conflict || mutation.isPending || refreshing) return;
        mutation.mutate(
          {
            path: `/projects/${screen.projectId}/objects/${screen.id}`,
            method: "PATCH",
            body: {
              expectedVersion: baseVersion,
              screenImplementation: report.data,
            },
          },
          { onSuccess: () => onClose(true) },
        );
      }}
    >
      <Stack>
        <Title order={4}>{t("Record implementation")}</Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <NativeSelect
            ref={first}
            label={t("Platform")}
            value={platform}
            data={Object.entries(platformNames).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(e) =>
              setPlatform(e.currentTarget.value as typeof platform)
            }
          />
          <NativeSelect
            label={t("Design version")}
            description={
              history.isPending ? t("Loading earlier designs…") : undefined
            }
            value={String(version)}
            data={versions.map((v) => ({ value: String(v), label: `v${v}` }))}
            onChange={(e) => setVersion(Number(e.currentTarget.value))}
          />
          <NativeSelect
            required
            label={t("Implementation status")}
            value={state}
            error={invalid && !state ? t("Choose a status") : undefined}
            data={[
              { value: "", label: t("Choose a status") },
              ...Object.entries(stateLabels).map(([value, label]) => ({
                value,
                label: t(label),
              })),
            ]}
            onChange={(e) => setState(e.currentTarget.value as typeof state)}
          />
        </SimpleGrid>
        {state && state !== "design_only" && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={t("Build")}
                required
                value={build}
                maxLength={120}
                onChange={(e) => setBuild(e.currentTarget.value)}
                error={
                  errors.includes("build")
                    ? t("Enter the release or build identifier.")
                    : undefined
                }
              />
              <TextInput
                label={t("Git commit")}
                value={commit}
                maxLength={64}
                onChange={(e) => setCommit(e.currentTarget.value)}
                error={
                  errors.includes("commit")
                    ? t("Enter 7–64 hexadecimal characters.")
                    : undefined
                }
              />
            </SimpleGrid>
            <TextInput
              type="url"
              label={t("Evidence URL")}
              description={t(
                "Link to a screenshot or release showing this screen.",
              )}
              required
              value={link}
              maxLength={2048}
              onChange={(e) => setLink(e.currentTarget.value)}
              error={
                errors.includes("evidenceUrl")
                  ? t("Enter an HTTPS link without credentials.")
                  : undefined
              }
            />
          </>
        )}
        {history.isError && (
          <Alert color="orange" role="alert">
            {t("Could not load earlier designs.")}{" "}
            <Button
              type="button"
              variant="subtle"
              onClick={() => void history.refetch()}
            >
              {t("Retry")}
            </Button>
          </Alert>
        )}
        {mutation.error && (
          <Alert color="red" role="alert" tabIndex={-1} ref={saveError}>
            {errorMessage(mutation.error)}{" "}
            {conflict && (
              <Button
                variant="subtle"
                type="button"
                loading={refreshing}
                onClick={() => void reload()}
              >
                {t("Refresh screen")}
              </Button>
            )}
          </Alert>
        )}
        {reloadError != null && (
          <Alert color="red" role="alert">
            {errorMessage(reloadError)}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button
            type="button"
            variant="default"
            disabled={mutation.isPending || refreshing}
            onClick={() => onClose(false)}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={conflict || refreshing}
          >
            {t("Save report")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

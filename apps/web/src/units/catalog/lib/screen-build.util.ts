import type { ProjectObject } from "@shared/api/schemas";
import type {
  ReportedImplementation,
  ScreenImplementation,
} from "@agentstack/contracts";
import { translate as t } from "@shared/i18n";

export const platformNames = {
  android: "Android",
  ios: "iOS",
  web: "Web",
} as const;
export const stateLabels = {
  design_only: "Design only",
  implemented: "Implemented",
  partial: "Partially implemented",
  app_changed: "App changed, design match unconfirmed",
} satisfies Record<ScreenImplementation["state"], string>;

export function designVersion(screen: ProjectObject) {
  return screen.designVersion ?? screen.version;
}

export function buildSummary(report: ReportedImplementation, version: number) {
  if (report.state !== "design_only" && report.designVersion < version)
    return t("Design updated after this build");
  if (report.state === "implemented")
    return t("Implemented in {build}", { build: report.build });
  if (report.state === "design_only" && report.designVersion < version)
    return t("Design only (v{version})", { version: report.designVersion });
  return t(stateLabels[report.state]);
}

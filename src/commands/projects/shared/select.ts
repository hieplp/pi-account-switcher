import { relative } from "node:path";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import type { ProjectBinding } from "@/types";

export async function selectProject(
  ui: ExtensionUIContext,
  title: string,
  projects: ProjectBinding[],
  runtime: AccountSwitcher,
): Promise<ProjectBinding | undefined> {
  const labelMap = new Map<string, ProjectBinding>();
  for (const project of projects) {
    labelMap.set(formatProject(project, runtime.findAccountById(project.accountId)?.label), project);
  }

  const choice = await ui.select(title, [...labelMap.keys()]);
  if (!choice) return undefined;
  return labelMap.get(choice);
}

export function formatProject(project: ProjectBinding, accountLabel?: string): string {
  const marker = project.enabled === false ? "disabled" : "enabled";
  const model = project.modelId && project.modelProvider ? ` → ${project.modelProvider}/${project.modelId}` : "";
  return `${shortPath(project.path)} — ${accountLabel ?? project.accountId}${model} (${marker})`;
}

function shortPath(path: string): string {
  const cwdRelative = relative(process.cwd(), path);
  if (cwdRelative && !cwdRelative.startsWith("..")) return cwdRelative === "" ? "." : cwdRelative;
  return path;
}

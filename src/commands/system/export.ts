import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { COMMANDS, DEFAULT_EXPORT_PATH, PROJECTS_PATH, STATE_PATH } from "@/constants";
import type { AccountSwitcherContext } from "@/types";
import { BaseCommand } from "../base";
import { errorUtil, fileUtil, uiUtil } from "@/utils";

type ExportSection = "accounts" | "providers" | "projects" | "state";

const EXPORT_OPTIONS: Array<{ label: string; section: ExportSection }> = [
  { label: "Accounts", section: "accounts" },
  { label: "Providers", section: "providers" },
  { label: "Project bindings", section: "projects" },
  { label: "Active state", section: "state" },
];

export const useExportCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new ExportCommand(pi, runtime).register();
};

class ExportCommand extends BaseCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.system.export);
  }

  async handler(ctx: AccountSwitcherContext, args?: string): Promise<void> {
    try {
      await this.runtime.load();

      const selectedLabels = await uiUtil.multiSelect(
        ctx.ui,
        "What do you want to export?",
        EXPORT_OPTIONS.map((option) => option.label),
        EXPORT_OPTIONS.map(() => true),
      );
      if (!selectedLabels) {
        ctx.ui.notify("Export cancelled.", "info");
        return;
      }

      const sections = selectedSections(selectedLabels);
      if (sections.length === 0) {
        ctx.ui.notify("Nothing selected to export.", "info");
        return;
      }

      const target = args?.trim() || (await ctx.ui.input("Export file (blank for default)", DEFAULT_EXPORT_PATH));
      if (target === undefined) {
        ctx.ui.notify("Export cancelled.", "info");
        return;
      }

      const exportData = await this.buildExportData(sections);
      const path = fileUtil.expandHome(target.trim() || DEFAULT_EXPORT_PATH);
      await fileUtil.writePrivateJson(path, exportData);
      ctx.ui.notify(`Exported ${sections.map(formatSection).join(", ")} to ${path}.`, "info");
    } catch (e) {
      ctx.ui.notify(`Failed to export: ${errorUtil.format(e)}`, "error");
    }
  }

  private async buildExportData(sections: ExportSection[]): Promise<Record<string, unknown>> {
    const selected = new Set(sections);
    const exportData: Record<string, unknown> = {
      version: 2,
      exportedAt: new Date().toISOString(),
      source: "pi-account-switcher",
      includes: {
        accounts: selected.has("accounts"),
        providers: selected.has("providers"),
        projects: selected.has("projects"),
        state: selected.has("state"),
      },
    };

    if (selected.has("accounts")) exportData.accounts = this.runtime.getAccounts();
    if (selected.has("providers")) exportData.providers = this.runtime.getProviders();
    if (selected.has("projects")) exportData.projects = await loadOptionalJson(PROJECTS_PATH, { projects: [] });
    if (selected.has("state")) exportData.state = await loadOptionalJson(STATE_PATH, {});

    return exportData;
  }
}

function selectedSections(labels: string[]): ExportSection[] {
  return EXPORT_OPTIONS.filter((option) => labels.includes(option.label)).map((option) => option.section);
}

function formatSection(section: ExportSection): string {
  return EXPORT_OPTIONS.find((option) => option.section === section)?.label.toLowerCase() ?? section;
}

async function loadOptionalJson(path: string, fallback: unknown): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (fileUtil.isMissingFileError(error)) return fallback;
    throw error;
  }
}

import { readFile } from "node:fs/promises";
import z from "zod";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { ACCOUNTS_PATH, COMMANDS, DEFAULT_EXPORT_PATH, PROJECTS_PATH, PROVIDERS_PATH, STATE_PATH } from "@/constants";
import { accountSchema, projectsConfigSchema, providerSchema } from "@/schemas";
import type { AccountConfig, AccountSwitcherContext, ProviderConfig } from "@/types";
import { BaseCommand } from "../base";
import { errorUtil, fileUtil, uiUtil } from "@/utils";

type ImportSection = "accounts" | "providers" | "projects" | "state";

const IMPORT_OPTIONS: Array<{ label: string; section: ImportSection }> = [
  { label: "Accounts", section: "accounts" },
  { label: "Providers", section: "providers" },
  { label: "Project bindings", section: "projects" },
  { label: "Active state", section: "state" },
];

const importStateSchema = z
  .object({
    activeAccountId: z.string().optional(),
    activeModelId: z.string().optional(),
    activeModelProvider: z.string().optional(),
  })
  .default({});

const exportBundleSchema = z
  .object({
    version: z.number().optional(),
    exportedAt: z.string().optional(),
    source: z.string().optional(),
    includes: z
      .object({
        accounts: z.boolean().optional(),
        providers: z.boolean().optional(),
        projects: z.boolean().optional(),
        state: z.boolean().optional(),
      })
      .optional(),
    accounts: z.array(accountSchema).optional(),
    providers: z.array(providerSchema.extend({ id: z.string().min(1) })).optional(),
    projects: projectsConfigSchema.optional(),
    state: importStateSchema.optional(),
  })
  .passthrough();

type ImportBundle = {
  version?: number;
  exportedAt?: string;
  accounts?: AccountConfig[];
  providers?: ProviderConfig[];
  projects?: z.infer<typeof projectsConfigSchema>;
  state?: z.infer<typeof importStateSchema>;
};

export const useImportCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new ImportCommand(pi, runtime).register();
};

class ImportCommand extends BaseCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.system.import);
  }

  async handler(ctx: AccountSwitcherContext, args?: string): Promise<void> {
    try {
      const source = args?.trim() || (await ctx.ui.input("Import file (blank for default)", DEFAULT_EXPORT_PATH));
      if (source === undefined) {
        ctx.ui.notify("Import cancelled.", "info");
        return;
      }

      const path = fileUtil.expandHome(source.trim() || DEFAULT_EXPORT_PATH);
      const bundle = parseImportBundle(JSON.parse(await readFile(path, "utf8")));
      const available = availableSections(bundle);
      if (available.length === 0) {
        ctx.ui.notify("Import file does not contain any supported sections.", "info");
        return;
      }

      const selectedLabels = await uiUtil.multiSelect(
        ctx.ui,
        previewTitle(bundle),
        IMPORT_OPTIONS.map((option) => option.label),
        IMPORT_OPTIONS.map((option) => available.includes(option.section)),
        IMPORT_OPTIONS.map((option) => !available.includes(option.section)),
      );
      if (!selectedLabels) {
        ctx.ui.notify("Import cancelled.", "info");
        return;
      }

      const sections = selectedSections(selectedLabels).filter((section) => available.includes(section));
      if (sections.length === 0) {
        ctx.ui.notify("Nothing selected to import.", "info");
        return;
      }

      const confirmed = await ctx.ui.confirm(
        "Import selected account switcher data?",
        `This will replace only: ${sections.map(formatSection).join(", ")} from ${path}. Other data will be kept.`,
      );
      if (!confirmed) {
        ctx.ui.notify("Import cancelled.", "info");
        return;
      }

      await importSections(bundle, sections);

      await this.runtime.load();
      await this.runtime.init(ctx);
      uiUtil.setAccountStatus(ctx.ui, this.runtime.getActiveAccount()?.label);

      ctx.ui.notify(
        `Imported ${sections.map((section) => sectionSummary(section, bundle)).join(", ")} from ${path}.`,
        "info",
      );
    } catch (e) {
      ctx.ui.notify(`Failed to import: ${errorUtil.format(e)}`, "error");
    }
  }
}

function parseImportBundle(raw: unknown): ImportBundle {
  const parsed = exportBundleSchema.parse(raw);
  if (parsed.accounts) {
    assertNoDuplicateIds(
      "account",
      parsed.accounts.map((account) => account.id),
    );
  }
  if (parsed.providers) {
    assertNoDuplicateIds(
      "provider",
      parsed.providers.map((provider) => provider.id),
    );
  }
  return parsed;
}

function availableSections(bundle: ImportBundle): ImportSection[] {
  return IMPORT_OPTIONS.map((option) => option.section).filter((section) => bundle[section] !== undefined);
}

function selectedSections(labels: string[]): ImportSection[] {
  return IMPORT_OPTIONS.filter((option) => labels.includes(option.label)).map((option) => option.section);
}

async function importSections(bundle: ImportBundle, sections: ImportSection[]): Promise<void> {
  const selected = new Set(sections);
  if (selected.has("accounts")) await fileUtil.writePrivateJson(ACCOUNTS_PATH, { accounts: bundle.accounts ?? [] });
  if (selected.has("providers")) await fileUtil.writePrivateJson(PROVIDERS_PATH, { providers: bundle.providers ?? [] });
  if (selected.has("projects")) await fileUtil.writePrivateJson(PROJECTS_PATH, bundle.projects ?? { projects: [] });
  if (selected.has("state")) await fileUtil.writePrivateJson(STATE_PATH, bundle.state ?? {});
}

function previewTitle(bundle: ImportBundle): string {
  const details = [
    `Accounts: ${bundle.accounts?.length ?? "not included"}`,
    `Providers: ${bundle.providers?.length ?? "not included"}`,
    `Project bindings: ${projectBindingCount(bundle.projects)}`,
    `Active state: ${bundle.state ? "included" : "not included"}`,
  ];
  if (bundle.exportedAt) details.push(`Exported: ${bundle.exportedAt}`);
  return `What do you want to import? (${details.join("; ")})`;
}

function sectionSummary(section: ImportSection, bundle: ImportBundle): string {
  switch (section) {
    case "accounts":
      return `${bundle.accounts?.length ?? 0} accounts`;
    case "providers":
      return `${bundle.providers?.length ?? 0} providers`;
    case "projects":
      return `${projectBindingCount(bundle.projects)} project bindings`;
    case "state":
      return "active state";
  }
}

function projectBindingCount(projects: unknown): string | number {
  if (projects === undefined) return "not included";
  if (Array.isArray(projects)) return projects.length;
  if (typeof projects === "object" && projects !== null && "projects" in projects) {
    const value = (projects as { projects?: unknown }).projects;
    if (Array.isArray(value)) return value.length;
    if (typeof value === "object" && value !== null) return Object.keys(value).length;
  }
  return "included";
}

function formatSection(section: ImportSection): string {
  return IMPORT_OPTIONS.find((option) => option.section === section)?.label.toLowerCase() ?? section;
}

function assertNoDuplicateIds(kind: string, ids: string[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  }
  if (duplicates.size > 0) {
    throw new Error(`Duplicate ${kind} ids: ${Array.from(duplicates).sort().join(", ")}`);
  }
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import type { AccountSwitcherContext, ProjectBinding } from "@/types";
import { BaseCommand, type CommandMeta } from "../../base";
import { selectProject } from ".";

export abstract class ProjectCommand extends BaseCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher, meta: CommandMeta) {
    super(pi, runtime, meta);
  }

  protected currentProjectPath(args?: string): string {
    return args?.trim() || process.cwd();
  }

  protected async loadProjects(ctx: AccountSwitcherContext): Promise<ProjectBinding[] | undefined> {
    await this.runtime.load();
    const projects = this.runtime.getProjects();
    if (projects.length === 0) {
      ctx.ui.notify("No project bindings configured.", "info");
      return undefined;
    }
    return projects;
  }

  protected async loadAndSelectProject(
    ctx: AccountSwitcherContext,
    label: string,
  ): Promise<ProjectBinding | undefined> {
    const projects = await this.loadProjects(ctx);
    if (!projects) return undefined;
    return selectProject(ctx.ui, label, projects, this.runtime);
  }
}

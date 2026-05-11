import { resolve } from "node:path";
import type { ProjectStore } from "@/storage";
import { useProjectStore } from "@/storage";
import type { ProjectBinding } from "@/types";
import { fileUtil } from "@/utils";

export interface ProjectService {
  load(): Promise<void>;
  getProjects(): ProjectBinding[];
  findProjectForPath(path: string): ProjectBinding | undefined;
  bindProject(input: BindProjectInput): Promise<ProjectBinding>;
  removeProject(path: string): Promise<void>;
}

export interface BindProjectInput {
  path: string;
  accountId: string;
  modelId?: string;
  modelProvider?: string;
  enabled?: boolean;
}

export function useProjectService(path: string): ProjectService {
  return new ProjectServiceImpl(useProjectStore(path));
}

class ProjectServiceImpl implements ProjectService {
  private projects: ProjectBinding[] = [];

  constructor(private readonly store: ProjectStore) {}

  async load(): Promise<void> {
    this.projects = await this.store.load();
  }

  getProjects(): ProjectBinding[] {
    return this.projects;
  }

  findProjectForPath(path: string): ProjectBinding | undefined {
    const normalized = normalizeProjectPath(path);
    return this.projects
      .filter((project) => project.enabled !== false && isSameOrParent(project.path, normalized))
      .sort((a, b) => b.path.length - a.path.length)[0];
  }

  async bindProject(input: BindProjectInput): Promise<ProjectBinding> {
    const now = new Date().toISOString();
    const path = normalizeProjectPath(input.path);
    const existing = this.projects.find((project) => project.path === path);
    const binding: ProjectBinding = {
      path,
      accountId: input.accountId,
      modelId: input.modelId,
      modelProvider: input.modelProvider,
      enabled: input.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.projects = existing
      ? this.projects.map((project) => (project.path === path ? binding : project))
      : [...this.projects, binding];
    await this.store.save(this.projects);
    return binding;
  }

  async removeProject(path: string): Promise<void> {
    const normalized = normalizeProjectPath(path);
    const next = this.projects.filter((project) => project.path !== normalized);
    if (next.length === this.projects.length) throw new Error(`Project binding not found: ${normalized}`);
    this.projects = next;
    await this.store.save(this.projects);
  }
}

function normalizeProjectPath(path: string): string {
  return resolve(fileUtil.expandHome(path));
}

function isSameOrParent(parent: string, child: string): boolean {
  const normalizedParent = normalizeProjectPath(parent);
  const normalizedChild = normalizeProjectPath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

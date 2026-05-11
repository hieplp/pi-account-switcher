import { readFile } from "node:fs/promises";
import { projectsConfigSchema } from "@/schemas";
import type { ProjectBinding } from "@/types";
import { errorUtil, fileUtil } from "@/utils";

export interface ProjectStore {
  load(): Promise<ProjectBinding[]>;
  save(projects: ProjectBinding[]): Promise<void>;
}

export function useProjectStore(path: string): ProjectStore {
  return new ProjectStoreImpl(path);
}

class ProjectStoreImpl implements ProjectStore {
  constructor(private readonly path: string) {}

  async load(): Promise<ProjectBinding[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = projectsConfigSchema.parse(JSON.parse(raw));
      assertNoDuplicateProjectPaths(parsed.projects);
      return parsed.projects;
    } catch (error) {
      if (fileUtil.isMissingFileError(error)) return [];
      throw new Error(`Failed to load project bindings at ${this.path}: ${errorUtil.format(error)}`);
    }
  }

  async save(projects: ProjectBinding[]): Promise<void> {
    assertNoDuplicateProjectPaths(projects);
    await fileUtil.writePrivateJson(this.path, { projects });
  }
}

function assertNoDuplicateProjectPaths(projects: ProjectBinding[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const project of projects) {
    if (seen.has(project.path)) duplicates.add(project.path);
    else seen.add(project.path);
  }
  if (duplicates.size > 0) {
    throw new Error(`Duplicate project paths: ${Array.from(duplicates).sort().join(", ")}`);
  }
}

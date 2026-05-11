import z from "zod";

export const projectBindingSchema = z.object({
  path: z.string().min(1),
  accountId: z.string().min(1),
  modelId: z.string().min(1).optional(),
  modelProvider: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const projectsConfigSchema = z.object({
  projects: z.array(projectBindingSchema).default([]),
});

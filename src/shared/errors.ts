import { z } from "zod";

export function formatError(error: unknown): string {
	if (error instanceof z.ZodError) {
		return error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`).join("; ");
	}
	return error instanceof Error ? error.message : String(error);
}

function formatPath(path: PropertyKey[]): string {
	return path.length > 0 ? path.join(".") : "root";
}

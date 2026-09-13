export type DataErrorCode = "validation" | "not_found" | "conflict";

export class DataError extends Error {
  constructor(
    public readonly code: DataErrorCode,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "DataError";
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

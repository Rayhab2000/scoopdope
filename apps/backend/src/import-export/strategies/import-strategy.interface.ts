export interface ImportStrategy {
  canHandle(mimeType: string): boolean;
  import(file: Buffer, userId: string): Promise<{ courseId: string }>;
  /** Optional path-based import that avoids loading the archive into heap. */
  importFromPath?(filePath: string, userId: string): Promise<{ courseId: string }>;
}

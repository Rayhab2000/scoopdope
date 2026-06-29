export interface ImportStrategy {
  canHandle(mimeType: string): boolean;
  import(file: Buffer, userId: string): Promise<{ courseId: string }>;
}

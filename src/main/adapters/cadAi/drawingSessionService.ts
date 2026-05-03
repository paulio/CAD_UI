import { resolve } from 'node:path';
import type { DiagnosticEntry, DrawingSession } from '../../../shared/contracts';
import { CadAiAdapter } from './cadAiAdapter';

type DiagnosticsLike = {
  add: (entry: DiagnosticEntry) => void;
};

type DrawingSessionServiceOptions = {
  cadAiRoot?: string;
  diagnostics: DiagnosticsLike;
  cadAiAdapter?: CadAiAdapter;
};

export class DrawingSessionService {
  private readonly cadAiAdapter: CadAiAdapter;

  private readonly diagnostics: DiagnosticsLike;

  constructor(options: DrawingSessionServiceOptions) {
    this.cadAiAdapter = options.cadAiAdapter ?? new CadAiAdapter({ cadAiRoot: options.cadAiRoot });
    this.diagnostics = options.diagnostics;
  }

  async openDrawing(filePath: string): Promise<DrawingSession> {
    const sourcePath = resolve(filePath);

    try {
      const ingest = await this.cadAiAdapter.ingest(sourcePath);
      const session = {
        sourcePath,
        dxfPath: ingest.dxfPath,
        cachePath: ingest.cachePath,
        openedAt: new Date().toISOString()
      } satisfies DrawingSession;

      this.diagnostics.add({
        timestamp: session.openedAt,
        source: 'cad-ai',
        level: 'info',
        message: `Opened drawing session for ${sourcePath}`,
        detail: ingest.cachePath
      });

      return session;
    } catch (error) {
      this.diagnostics.add({
        timestamp: new Date().toISOString(),
        source: 'cad-ai',
        level: 'error',
        message: `Failed to open drawing session for ${sourcePath}`,
        detail: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
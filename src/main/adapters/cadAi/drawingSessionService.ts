import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
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
      const dxfPath = await resolveUsableDxfPath(this.cadAiAdapter, sourcePath, ingest.dxfPath);
      const session = {
        sourcePath,
        dxfPath,
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

async function resolveUsableDxfPath(cadAiAdapter: CadAiAdapter, sourcePath: string, dxfPath: string | null): Promise<string> {
  if (dxfPath !== null) {
    return dxfPath;
  }

  if (sourcePath.toLowerCase().endsWith('.dwg')) {
    let convertedOutputPath = '';
    const stableDxfPath = sourcePath.replace(/\.dwg$/i, '.dxf');
    const temporaryDxfPath = resolve(tmpdir(), `${sourcePath.split(/[\\/]/).pop()?.replace(/\.dwg$/i, '') ?? 'cad-ui'}.converted.dxf`);

    try {
      const converted = await cadAiAdapter.convertDwgToDxf(sourcePath, temporaryDxfPath);
      convertedOutputPath = converted.outputPath.trim();
    } catch {
      convertedOutputPath = '';
    }

    if (convertedOutputPath.length > 0) {
      const resolvedConvertedPath = resolve(convertedOutputPath);
      const resolvedStablePath = resolve(stableDxfPath);

      if (resolvedConvertedPath === resolvedStablePath) {
        return resolvedStablePath;
      }

      await mkdir(dirname(resolvedStablePath), { recursive: true }).catch(() => undefined);
      await copyFile(resolvedConvertedPath, resolvedStablePath);
      return resolvedStablePath;
    }

    throw new Error(
      `Opened DWG ${sourcePath} but CAD_AI did not provide a usable DXF path after conversion.`
    );
  }

  throw new Error(`Opened drawing ${sourcePath} but no usable DXF path was available.`);
}


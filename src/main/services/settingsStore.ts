import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { AppSettings, WindowBounds } from '../../shared/contracts';

export function defaultSettings(): AppSettings {
  return {
    selectedModel: null,
    recentDrawings: [],
    lastDrawingPath: null,
    windowBounds: null
  };
}

function isWindowBounds(value: unknown): value is WindowBounds {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const bounds = value as Record<string, unknown>;

  return typeof bounds.width === 'number' && typeof bounds.height === 'number';
}

function normalizeSettings(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null) {
    return defaultSettings();
  }

  const raw = value as Record<string, unknown>;

  return {
    selectedModel: typeof raw.selectedModel === 'string' ? raw.selectedModel : null,
    recentDrawings: Array.isArray(raw.recentDrawings)
      ? raw.recentDrawings.filter((entry): entry is string => typeof entry === 'string')
      : [],
    lastDrawingPath: typeof raw.lastDrawingPath === 'string' ? raw.lastDrawingPath : null,
    windowBounds: isWindowBounds(raw.windowBounds) ? raw.windowBounds : null
  };
}

export class SettingsStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      try {
        return normalizeSettings(JSON.parse(raw));
      } catch (error) {
        throw new Error(`Settings file contains invalid JSON: ${this.filePath}`, {
          cause: error
        });
      }
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return defaultSettings();
      }

      throw error;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });

    const tempPath = join(
      dirname(this.filePath),
      `.${basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`
    );

    try {
      await fs.writeFile(tempPath, JSON.stringify(normalizeSettings(settings), null, 2), 'utf8');
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

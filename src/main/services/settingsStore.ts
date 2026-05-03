import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
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
      return normalizeSettings(JSON.parse(raw));
    } catch {
      return defaultSettings();
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(normalizeSettings(settings), null, 2), 'utf8');
  }
}
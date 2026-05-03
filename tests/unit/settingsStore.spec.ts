import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/main/services/settingsStore';

const settingsFilePath = 'tests/.tmp/settings.json';

describe('SettingsStore', () => {
  it('returns defaults when the settings file is missing', async () => {
    await rm(settingsFilePath, { force: true });

    const store = new SettingsStore(settingsFilePath);
    const settings = await store.load();

    expect(settings).toEqual({
      selectedModel: null,
      recentDrawings: [],
      lastDrawingPath: null,
      windowBounds: null
    });
  });

  it('fails deliberately when the settings file contains invalid JSON', async () => {
    await mkdir(dirname(settingsFilePath), { recursive: true });
    await writeFile(settingsFilePath, '{invalid json', 'utf8');

    const store = new SettingsStore(settingsFilePath);

    await expect(store.load()).rejects.toThrow(`Settings file contains invalid JSON: ${settingsFilePath}`);

    await rm(settingsFilePath, { force: true });
  });

  it('surfaces non-missing read failures', async () => {
    await rm(settingsFilePath, { force: true });
    await mkdir(settingsFilePath, { recursive: true });

    const store = new SettingsStore(settingsFilePath);

    await expect(store.load()).rejects.toMatchObject({
      code: 'EISDIR'
    });

    await rm(settingsFilePath, { force: true, recursive: true });
  });

  it('persists and reloads the selected model', async () => {
    await rm(settingsFilePath, { force: true });
    await rm(dirname(settingsFilePath), { force: true, recursive: true });

    const store = new SettingsStore(settingsFilePath);

    await store.save({
      selectedModel: 'gpt-5.4',
      recentDrawings: [],
      lastDrawingPath: null,
      windowBounds: null
    });

    const reloaded = new SettingsStore(settingsFilePath);
    const settings = await reloaded.load();
    const files = await readdir(dirname(settingsFilePath));

    expect(settings.selectedModel).toBe('gpt-5.4');
    expect(files).toEqual(['settings.json']);

    await rm(dirname(settingsFilePath), { force: true, recursive: true });
  });
});

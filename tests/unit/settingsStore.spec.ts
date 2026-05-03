import { rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/main/services/settingsStore';

const settingsFilePath = 'tests/.tmp/settings.json';

describe('SettingsStore', () => {
  it('persists and reloads the selected model', async () => {
    await rm(settingsFilePath, { force: true });

    const store = new SettingsStore(settingsFilePath);

    await store.save({
      selectedModel: 'gpt-5.4',
      recentDrawings: [],
      lastDrawingPath: null,
      windowBounds: null
    });

    const reloaded = new SettingsStore(settingsFilePath);
    const settings = await reloaded.load();

    expect(settings.selectedModel).toBe('gpt-5.4');

    await rm(settingsFilePath, { force: true });
  });
});
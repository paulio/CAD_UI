import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('persists model selection across restart', async () => {
  const appDataPath = await mkdtemp(join(tmpdir(), 'cad-ui-e2e-'));
  const launchEnv = {
    ...process.env,
    APPDATA: appDataPath,
    CAD_UI_E2E: '1',
    CAD_UI_E2E_MODELS: 'gpt-5.4,gpt-5.4-mini',
    CAD_UI_E2E_AUTH_STATE: 'ready',
    PATH: ''
  };

  const app = await electron.launch({
    args: ['dist-electron/main/main.js'],
    env: launchEnv
  });

  try {
    const page = await app.firstWindow();
    const modelSelect = page.getByLabel('Copilot model');

    await expect(modelSelect).toBeEnabled();
    await modelSelect.selectOption('gpt-5.4-mini');
    await expect(page.getByText('Selected model: gpt-5.4-mini')).toBeVisible();

    await app.close();

    const reopened = await electron.launch({
      args: ['dist-electron/main/main.js'],
      env: launchEnv
    });

    try {
      const reopenedPage = await reopened.firstWindow();
      await expect(reopenedPage.getByLabel('Copilot model')).toHaveValue('gpt-5.4-mini');
      await expect(reopenedPage.getByText('Selected model: gpt-5.4-mini')).toBeVisible();
    } finally {
      await reopened.close();
    }
  } finally {
    await app.close().catch(() => undefined);
    await rm(appDataPath, { recursive: true, force: true });
  }
});
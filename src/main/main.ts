import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc/registerIpc';
import { SettingsStore } from './services/settingsStore';
import { createMainWindow } from './window/createMainWindow';

async function bootstrap(): Promise<void> {
  await app.whenReady();

  registerIpc(new SettingsStore(join(app.getPath('userData'), 'settings.json')));
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

void bootstrap();
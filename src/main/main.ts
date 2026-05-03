import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window/createMainWindow';

async function bootstrap(): Promise<void> {
  await app.whenReady();
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
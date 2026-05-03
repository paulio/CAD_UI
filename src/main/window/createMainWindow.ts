import { join, resolve } from 'node:path';
import { BrowserWindow } from 'electron';

export async function createMainWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    return mainWindow;
  }

  await mainWindow.loadFile(resolve(__dirname, '../../dist/renderer/index.html'));
  return mainWindow;
}
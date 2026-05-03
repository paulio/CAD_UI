import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, CadUiApi, SendPromptRequest } from '../shared/contracts';
import { ipcChannels } from '../shared/contracts';

const cadUiApi: CadUiApi = {
	loadSettings: () => ipcRenderer.invoke(ipcChannels.loadSettings),
	saveSettings: (settings: AppSettings) => ipcRenderer.invoke(ipcChannels.saveSettings, settings),
	loadBootstrap: () => ipcRenderer.invoke(ipcChannels.loadBootstrap),
	openDrawing: () => ipcRenderer.invoke(ipcChannels.openDrawing),
	sendPrompt: (request: SendPromptRequest) => ipcRenderer.invoke(ipcChannels.sendPrompt, request)
};

contextBridge.exposeInMainWorld('cadUiApi', cadUiApi);
import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, CadUiApi, SendPromptRequest } from '../shared/contracts';
import { ipcChannels } from '../shared/contracts';

function invoke<TReturn>(channel: string, payload?: unknown): Promise<TReturn> {
  return ipcRenderer.invoke(channel, payload) as Promise<TReturn>;
}

const cadUiApi: CadUiApi = {
	loadSettings: () => invoke(ipcChannels.loadSettings),
	saveSettings: (settings: AppSettings) => invoke(ipcChannels.saveSettings, settings),
	loadBootstrap: () => invoke(ipcChannels.loadBootstrap),
	listDiagnostics: () => invoke(ipcChannels.listDiagnostics),
	openDrawing: () => invoke(ipcChannels.openDrawing),
	sendPrompt: (request: SendPromptRequest) => invoke(ipcChannels.sendPrompt, request)
};

contextBridge.exposeInMainWorld('cadUiApi', cadUiApi);
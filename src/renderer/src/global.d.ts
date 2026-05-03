import type { CadUiApi } from '../../shared/contracts';

declare global {
  interface Window {
    cadUiApi: CadUiApi;
  }
}

export {};
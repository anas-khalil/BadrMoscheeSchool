/// <reference types="vite/client" />

declare module 'virtual:pwa-register' {
  type RegisterSWOptions = {
    immediate?: boolean;
    onOfflineReady?: () => void;
    onNeedRefresh?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  };

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => void;
}

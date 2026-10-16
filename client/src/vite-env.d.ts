/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_PAYLOAD_PUBLIC_KEY?: string;
  readonly VITE_PAYLOAD_KID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

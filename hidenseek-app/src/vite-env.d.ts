/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Pre-fills the server address on first launch, for builds you hand to friends. */
  readonly VITE_DEFAULT_SERVER?: string;
}

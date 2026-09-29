/// <reference types="vite/client" />
interface ImportMetaEnv {
 readonly VITE_TAVILY_API_KEY?: string;
 readonly VITE_TAVILY_API_URL?: string;
 readonly VITE_JEV_GATEWAY_URL?: string;
 readonly VITE_JEV_API_KEY?: string;
 readonly VITE_WEBHOOK_BEARER?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

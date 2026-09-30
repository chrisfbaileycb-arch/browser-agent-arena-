import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envPrefix: "REACT_APP_",
  server: { host: "0.0.0.0", port: 3000, strictPort: true, allowedHosts: true, hmr: { clientPort: 443 } },
});

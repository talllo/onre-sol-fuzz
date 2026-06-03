import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root,
    define: {
        global: "globalThis",
    },
    resolve: {
        alias: {
            buffer: "buffer/index.js",
        },
    },
    optimizeDeps: {
        include: ["buffer"],
    },
    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: false,
    },
    build: {
        outDir: resolve(root, "../../dist/ui"),
        emptyOutDir: true,
    },
});

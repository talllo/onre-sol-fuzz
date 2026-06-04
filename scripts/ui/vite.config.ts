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
        proxy: {
            "/rpc": {
                target: "https://api.mainnet-beta.solana.com",
                changeOrigin: true,
                rewrite: () => "/",
                configure: (proxy: { on: (arg0: string, arg1: (proxyReq: any) => void) => void }) => {
                    proxy.on("proxyReq", (proxyReq) => {
                        proxyReq.removeHeader("origin");
                        proxyReq.removeHeader("referer");
                    });
                },
            },
        },
    },
    build: {
        outDir: resolve(root, "../../dist/ui"),
        emptyOutDir: true,
    },
});

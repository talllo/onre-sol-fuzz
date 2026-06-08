import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const rpcProxyTarget = process.env.UI_RPC_PROXY_TARGET ?? "https://api.mainnet-beta.solana.com";
const serverHost = process.env.UI_HOST ?? "127.0.0.1";
const serverPort = Number(process.env.UI_PORT ?? "5173");

interface MiddlewareServer {
    middlewares: {
        use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) => void;
    };
}

export default defineConfig({
    root,
    plugins: [
        {
            name: "onre-custom-rpc-proxy",
            configureServer(server: MiddlewareServer) {
                server.middlewares.use("/custom-rpc", async (req: IncomingMessage, res: ServerResponse) => {
                    try {
                        if (req.method === "OPTIONS") {
                            writeCorsHeaders(res);
                            res.statusCode = 204;
                            res.end();
                            return;
                        }
                        if (req.method !== "POST") {
                            res.statusCode = 405;
                            res.end("Only POST is supported");
                            return;
                        }

                        const requestUrl = new URL(req.url ?? "", "http://127.0.0.1");
                        const target = requestUrl.searchParams.get("target");
                        if (!target) {
                            res.statusCode = 400;
                            res.end("Missing target RPC URL");
                            return;
                        }

                        const targetUrl = new URL(target);
                        if (!["http:", "https:"].includes(targetUrl.protocol)) {
                            res.statusCode = 400;
                            res.end("Target RPC URL must use http or https");
                            return;
                        }

                        const body = (await readRequestBody(req)).toString("utf8");
                        const response = await fetch(targetUrl, {
                            method: "POST",
                            headers: { "content-type": headerValue(req.headers["content-type"]) ?? "application/json" },
                            body,
                        });
                        const text = await response.text();
                        writeCorsHeaders(res);
                        res.statusCode = response.status;
                        res.setHeader("content-type", response.headers.get("content-type") ?? "application/json");
                        res.end(text);
                    } catch (error) {
                        writeCorsHeaders(res);
                        res.statusCode = 502;
                        res.setHeader("content-type", "application/json");
                        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: 502, message: error instanceof Error ? error.message : String(error) }, id: null }));
                    }
                });
            },
        },
    ],
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
        host: serverHost,
        port: serverPort,
        strictPort: false,
        proxy: {
            "/rpc": {
                target: rpcProxyTarget,
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

function writeCorsHeaders(res: { setHeader: (name: string, value: string) => void }): void {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type, authorization, *");
}

function headerValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value;
}

async function readRequestBody(req: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

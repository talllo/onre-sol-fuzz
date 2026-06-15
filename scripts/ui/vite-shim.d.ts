declare module "vite" {
    export function defineConfig(config: unknown): unknown;
}

interface ImportMeta {
    env: {
        VITE_ONRE_PROGRAM_ID?: string;
        VITE_ONRE_RPC_URL?: string;
    };
}

import { PublicKey } from "@solana/web3.js";

export const LOCAL_RPC_URL = process.env.SURFPOOL_RPC_URL ?? "http://127.0.0.1:8899";
export const LOCAL_WS_URL = process.env.SURFPOOL_WS_URL ?? "ws://127.0.0.1:8900";
export const STUDIO_URL = process.env.SURFPOOL_STUDIO_URL ?? "http://127.0.0.1:18488";
export const PROGRAM_ID = new PublicKey("onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe");

export const MINTS = {
    usdc: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    usdt: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    usdg: new PublicKey("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH"),
    onyc: new PublicKey("5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5"),
} as const;

export const TOKEN_DECIMALS = {
    usdc: 6,
    usdt: 6,
    usdg: 6,
    onyc: 9,
} as const;

const STABLE_BASE_UNITS = 10 ** 6;
const ONYC_BASE_UNITS = 10 ** TOKEN_DECIMALS.onyc;

export const ACTIVE_OFFERS = [
    { symbol: "USDC", key: "usdc", mint: MINTS.usdc },
    { symbol: "USDG", key: "usdg", mint: MINTS.usdg },
] as const;

export const ACTIVE_REDEMPTIONS = [
    { symbol: "USDC", key: "usdc", mint: MINTS.usdc },
    { symbol: "USDG", key: "usdg", mint: MINTS.usdg },
] as const;

export const PROP_AMM_DEFAULTS = {
    enabled: true,
    curvePegHaircutBps: 700,
    curveExponentScaled: 25_000,
    cadenceThreshold: 20,
    cadenceWaveScaled: 10_000,
    epochDurationSeconds: 86_400,
    wallSensitivityScaled: 20_000,
    minimumSellHaircutOnyc: 5_000_000_000,
} as const;

function regressionEnv(name: string, fallback: string): string | undefined {
    return process.env[`SURFPOOL_REGRESSION_${name}`] ?? process.env[`SURFPOOL_SMOKE_${name}`] ?? process.env[fallback];
}

export const BASIS_POINT_SCALE = 10_000;
export const BUFFER_GROSS_APR_15_PERCENT = 150_000;
export const DEFAULT_MANAGEMENT_FEE_BPS = Number(regressionEnv("MANAGEMENT_FEE_BPS", "") ?? "100");
export const DEFAULT_PERFORMANCE_FEE_BPS = Number(regressionEnv("PERFORMANCE_FEE_BPS", "") ?? "100");

export const SMALL_STABLE_AMOUNT = 5 * STABLE_BASE_UNITS;
export const BIG_STABLE_AMOUNT = Number(regressionEnv("BIG_STABLE_AMOUNT", "") ?? `${5_000_000 * STABLE_BASE_UNITS}`);
export const USER_STABLE_BALANCE = Number(regressionEnv("USER_STABLE_BALANCE", "") ?? `${25_000_000 * STABLE_BASE_UNITS}`);
export const SMALL_ONYC_REDEMPTION_AMOUNT = 1 * ONYC_BASE_UNITS;
export const PROP_AMM_SELL_ONYC_AMOUNT = 6_000 * ONYC_BASE_UNITS;

export const ONRE_SO_PATH = regressionEnv("PROGRAM_SO", "") ?? "target/deploy/onreapp.so";

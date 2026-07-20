import type { NetworkConfig } from "../../utils/script-helper";
import { ParamDefinition } from "../prompts/types";

export const bufferInitParams: ParamDefinition[] = [
    {
        name: "offer",
        type: "publicKey",
        description: "Main offer PDA used by BUFFER",
        required: true,
        flag: "--offer",
    },
    {
        name: "onycMint",
        type: "mint",
        description: "ONyc mint address",
        required: true,
        flag: "--onyc-mint",
        default: (cfg: NetworkConfig) => cfg.mints.onyc,
    },
];

export const bufferGrossYieldParams: ParamDefinition[] = [
    {
        name: "grossYield",
        type: "apr",
        description: "Gross yield (scale=1e6; 100000 = 10%; maximum = 1000000 / 100%)",
        required: true,
        flag: "--gross-yield",
    },
];

export const bufferFeeConfigParams: ParamDefinition[] = [
    {
        name: "managementFeeBps",
        type: "string",
        description: "Management fee in basis points",
        required: true,
        flag: "--management-fee-bps",
        transform: (value: any) => parseInt(value, 10),
    },
    {
        name: "performanceFeeBps",
        type: "string",
        description: "Performance fee in basis points",
        required: true,
        flag: "--performance-fee-bps",
        transform: (value: any) => parseInt(value, 10),
    },
];

export const bufferReserveVaultParams: ParamDefinition[] = [
    {
        name: "onycMint",
        type: "mint",
        description: "ONyc mint address",
        required: true,
        flag: "--onyc-mint",
        default: (cfg: NetworkConfig) => cfg.mints.onyc,
    },
    {
        name: "amount",
        type: "u64",
        description: "Amount of ONyc to move (raw)",
        required: true,
        flag: "--amount",
        shortFlag: "-a",
    },
];

export const bufferBurnParams: ParamDefinition[] = [
    {
        name: "tokenIn",
        type: "mint",
        description: "Offer token-in mint used for NAV/TVL context (e.g. USDC or USDT)",
        required: true,
        flag: "--token-in",
        default: (cfg: NetworkConfig) => cfg.mints.usdc,
    },
    {
        name: "assetAdjustmentAmount",
        type: "amount",
        description: "Asset adjustment amount used by burn formula (raw, 9 decimals)",
        required: true,
        flag: "--asset-adjustment-amount",
    },
    {
        name: "targetNav",
        type: "amount",
        description: "Target NAV value (raw, 9 decimals)",
        required: true,
        flag: "--target-nav",
    },
    {
        name: "onycMint",
        type: "mint",
        description: "ONyc mint address",
        required: true,
        flag: "--onyc-mint",
        default: (cfg: NetworkConfig) => cfg.mints.onyc,
    },
];

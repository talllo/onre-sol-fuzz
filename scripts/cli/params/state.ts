import type { NetworkConfig } from "../../utils/script-helper";
import { PublicKey } from "@solana/web3.js";
import { ParamDefinition } from "../prompts/types";

/**
 * State command parameter definitions
 */

export const proposeBossParams: ParamDefinition[] = [
    {
        name: "newBoss",
        type: "publicKey",
        description: "New boss public key",
        required: true,
        flag: "--new-boss",
    },
];

export const acceptBossParams: ParamDefinition[] = [
    {
        name: "newBoss",
        type: "publicKey",
        description: "New boss public key (must match proposed boss)",
        required: true,
        flag: "--new-boss",
    },
];

export const adminParams: ParamDefinition[] = [
    {
        name: "admin",
        type: "publicKey",
        description: "Admin public key",
        required: true,
        flag: "--admin",
    },
];

export const approverParams: ParamDefinition[] = [
    {
        name: "approver",
        type: "publicKey",
        description: "Approver public key",
        required: true,
        flag: "--approver",
    },
];

export const setOnycMintParams: ParamDefinition[] = [
    {
        name: "mint",
        type: "mint",
        description: "ONyc mint address",
        required: true,
        flag: "--mint",
        default: (cfg: NetworkConfig) => cfg.mints.onyc,
    },
];

export const maxSupplyParams: ParamDefinition[] = [
    {
        name: "amount",
        type: "u64",
        description: "Maximum supply amount (raw, with 9 decimals)",
        required: true,
        flag: "--amount",
    },
];

export const maxMintAmountParams: ParamDefinition[] = [
    {
        name: "amount",
        type: "u64",
        description: "Maximum ONyc mint amount per instruction (raw, with 9 decimals)",
        required: true,
        flag: "--amount",
    },
];

export const mainOfferParams: ParamDefinition[] = [
    {
        name: "offer",
        type: "publicKey",
        description: "Main offer PDA",
        required: true,
        flag: "--offer",
    },
];

export const excludedOwnersParams: ParamDefinition[] = [
    {
        name: "owners",
        type: "string",
        description: "Comma-separated owner public keys to exclude from circulating supply",
        required: true,
        flag: "--owners",
        transform: (value: string) => value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => new PublicKey(item)),
    },
];

export const updateExcludedBalanceParams: ParamDefinition[] = [
    {
        name: "onycMint",
        type: "mint",
        description: "ONyc mint address",
        required: true,
        flag: "--onyc-mint",
        default: (cfg: NetworkConfig) => cfg.mints.onyc,
    },
];

export const redemptionAdminParams: ParamDefinition[] = [
    {
        name: "redemptionAdmin",
        type: "publicKey",
        description: "Redemption admin public key",
        required: true,
        flag: "--redemption-admin",
    },
];

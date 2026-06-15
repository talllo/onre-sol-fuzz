/**
 * Vault command parameter definitions
 */

export { vaultParams } from "./common";
import { PublicKey } from "@solana/web3.js";
import { ParamDefinition } from "../prompts/types";

const configurableVaultChoices = [
    { name: "Offer fee", value: "offer-fee" },
    { name: "Permissionless offer fee", value: "permissionless-offer-fee" },
    { name: "Redemption fee", value: "redemption-fee" },
    { name: "Management fee", value: "management-fee" },
    { name: "Performance fee", value: "performance-fee" },
    { name: "Prop AMM buy fee", value: "prop-amm-buy-fee" },
    { name: "Prop AMM sell fee", value: "prop-amm-sell-fee" },
    { name: "Offer proceeds", value: "offer-proceeds" },
    { name: "Prop AMM proceeds", value: "prop-amm-proceeds" },
];

export const setConfigurableVaultDestinationParams: ParamDefinition[] = [
    {
        name: "kind",
        type: "select",
        description: "Configurable vault kind",
        required: true,
        flag: "--kind",
        choices: configurableVaultChoices,
    },
    {
        name: "destination",
        type: "publicKey",
        description: "Withdrawal destination owner",
        required: true,
        flag: "--destination",
    },
];

export const withdrawConfigurableVaultParams: ParamDefinition[] = [
    {
        name: "kind",
        type: "select",
        description: "Configurable vault kind",
        required: true,
        flag: "--kind",
        choices: configurableVaultChoices,
    },
    {
        name: "tokenMint",
        type: "mint",
        description: "Token mint to withdraw",
        required: true,
        flag: "--token",
        shortFlag: "-t",
    },
    {
        name: "amount",
        type: "string",
        description: "Amount to withdraw (raw, 0 = full balance)",
        required: true,
        flag: "--amount",
        shortFlag: "-a",
        transform: (value: any) => value.toString(),
    },
];

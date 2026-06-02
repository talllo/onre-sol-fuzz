import type { NetworkConfig } from "../../utils/script-helper";
import { ParamDefinition } from "../prompts/types";
import { tokenPairParams } from "./common";

function parseInteger(value: any): number {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("Value must be a non-negative integer");
    }
    return parsed;
}

function parseU64String(value: any): string {
    const raw = value?.toString();
    if (!raw || !/^\d+$/.test(raw)) {
        throw new Error("Value must be a non-negative integer string");
    }
    return raw;
}

export const propAmmConfigureParams: ParamDefinition[] = [
    {
        name: "assetMint",
        type: "mint",
        description: "Asset mint for the Prop AMM pair",
        required: true,
        flag: "--asset-mint",
        default: (cfg: NetworkConfig) => cfg.mints.usdg,
    },
    {
        name: "enabled",
        type: "boolean",
        description: "Whether the Prop AMM pair is enabled",
        required: true,
        flag: "--enabled",
        default: true,
    },
    {
        name: "curvePegHaircutBps",
        type: "string",
        description: "Curve peg haircut in basis points",
        required: true,
        flag: "--curve-peg-haircut-bps",
        default: "700",
        transform: parseInteger,
    },
    {
        name: "curveExponentScaled",
        type: "string",
        description: "Curve exponent scaled value",
        required: true,
        flag: "--curve-exponent-scaled",
        default: "25000",
        transform: parseInteger,
    },
    {
        name: "minCadenceExponentScaled",
        type: "string",
        description: "Minimum cadence exponent scaled value",
        required: true,
        flag: "--min-cadence-exponent-scaled",
        default: "1000",
        transform: parseInteger,
    },
    {
        name: "cadenceThreshold",
        type: "string",
        description: "Cadence threshold",
        required: true,
        flag: "--cadence-threshold",
        default: "20",
        transform: parseInteger,
    },
    {
        name: "cadenceSensitivityScaled",
        type: "string",
        description: "Cadence sensitivity scaled value",
        required: true,
        flag: "--cadence-sensitivity-scaled",
        default: "10000",
        transform: parseInteger,
    },
    {
        name: "epochDurationSeconds",
        type: "string",
        description: "Epoch duration in seconds",
        required: true,
        flag: "--epoch-duration-seconds",
        default: "86400",
        transform: parseU64String,
    },
    {
        name: "wallSensitivityScaled",
        type: "string",
        description: "Hard wall sensitivity scaled value",
        required: true,
        flag: "--wall-sensitivity-scaled",
        default: "20000",
        transform: parseInteger,
    },
    {
        name: "minimumSellHaircutOnyc",
        type: "string",
        description: "Minimum ONYC sell haircut in raw units",
        required: true,
        flag: "--minimum-sell-haircut-onyc",
        default: "5000000000",
        transform: parseU64String,
    },
];

export const propAmmSwapParams: ParamDefinition[] = [
    ...tokenPairParams,
    {
        name: "amount",
        type: "string",
        description: "Token in amount in raw units",
        required: true,
        flag: "--amount",
        shortFlag: "-a",
        transform: parseU64String,
    },
    {
        name: "minimumOut",
        type: "string",
        description: "Minimum token out amount in raw units",
        required: true,
        flag: "--minimum-out",
        default: "1",
        transform: parseU64String,
    },
];

export const propAmmQuoteParams: ParamDefinition[] = [
    ...tokenPairParams,
    {
        name: "amount",
        type: "string",
        description: "Token in amount in raw units",
        required: true,
        flag: "--amount",
        shortFlag: "-a",
        transform: parseU64String,
    },
];

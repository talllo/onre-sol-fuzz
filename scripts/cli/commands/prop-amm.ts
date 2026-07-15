import { Command } from "commander";
import type { GlobalOptions } from "../prompts";
import {
    executePropAmmBuy,
    executePropAmmConfigure,
    executePropAmmQuoteBuy,
    executePropAmmQuoteSell,
    executePropAmmSell,
} from "../implementations";

export function registerPropAmmCommands(program: Command): void {
    program
        .command("configure")
        .description("Configure a Prop AMM pair")
        .option("--asset-mint <mint>", "Asset mint")
        .option("--enabled <boolean>", "Enabled state (true/false)")
        .option("--curve-peg-haircut-bps <value>", "Curve peg haircut in basis points")
        .option("--curve-exponent-scaled <value>", "Curve exponent scaled value")
        .option("--cadence-threshold <value>", "Cadence threshold")
        .option("--cadence-wave-scaled <value>", "Maximum cadence-wave height scaled by 10,000")
        .option("--epoch-duration-seconds <value>", "Epoch duration in seconds")
        .option("--wall-sensitivity-scaled <value>", "Hard wall sensitivity scaled value")
        .option("--minimum-sell-haircut-onyc <value>", "Minimum ONYC sell haircut in raw units")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executePropAmmConfigure(opts);
        });

    program
        .command("quote-buy")
        .description("Quote a Prop AMM buy")
        .option("-i, --token-in <mint>", "Token in mint")
        .option("-o, --token-out <mint>", "Token out mint")
        .option("-a, --amount <amount>", "Token in amount in raw units")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executePropAmmQuoteBuy(opts);
        });

    program
        .command("quote-sell")
        .description("Quote a Prop AMM sell")
        .option("-i, --token-in <mint>", "Token in mint")
        .option("-o, --token-out <mint>", "Token out mint")
        .option("-a, --amount <amount>", "Token in amount in raw units")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executePropAmmQuoteSell(opts);
        });

    program
        .command("buy")
        .description("Execute a Prop AMM buy")
        .option("-i, --token-in <mint>", "Token in mint")
        .option("-o, --token-out <mint>", "Token out mint")
        .option("-a, --amount <amount>", "Token in amount in raw units")
        .option("--minimum-out <amount>", "Minimum token out amount in raw units")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executePropAmmBuy(opts);
        });

    program
        .command("sell")
        .description("Execute a Prop AMM sell")
        .option("-i, --token-in <mint>", "Token in mint")
        .option("-o, --token-out <mint>", "Token out mint")
        .option("-a, --amount <amount>", "Token in amount in raw units")
        .option("--minimum-out <amount>", "Minimum token out amount in raw units")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executePropAmmSell(opts);
        });
}

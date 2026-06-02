import { Command } from "commander";
import type { GlobalOptions } from "../prompts";
import {
    executeMarketApy,
    executeMarketNav,
    executeMarketNavAdjustment,
    executeMarketRefresh,
    executeMarketSupply,
    executeMarketSupplyV2,
    executeMarketTvl,
    executeMarketTvlV2,
} from "../implementations";

/**
 * Register market subcommands
 */
export function registerMarketCommands(program: Command): void {
    // market nav
    program
        .command("nav")
        .description("Get current NAV (Net Asset Value) for an offer")
        .option("-i, --token-in <mint>", "Token in mint (usdc, onyc, usdg, or address)")
        .option("-o, --token-out <mint>", "Token out mint (usdc, onyc, usdg, or address)")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executeMarketNav(opts);
        });

    // market nav-adjustment
    program
        .command("nav-adjustment")
        .description("Get NAV adjustment (price change) for an offer")
        .option("-i, --token-in <mint>", "Token in mint (usdc, onyc, usdg, or address)")
        .option("-o, --token-out <mint>", "Token out mint (usdc, onyc, usdg, or address)")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executeMarketNavAdjustment(opts);
        });

    // market apy
    program
        .command("apy")
        .description("Get current APY for an offer")
        .option("-i, --token-in <mint>", "Token in mint")
        .option("-o, --token-out <mint>", "Token out mint")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executeMarketApy(opts);
        });

    // market tvl
    program
        .command("tvl")
        .description("Get Total Value Locked")
        .option("-i, --token-in <mint>", "Token in mint")
        .option("-o, --token-out <mint>", "Token out mint")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executeMarketTvl(opts);
        });

    // market tvl-v2
    program
        .command("tvl-v2")
        .description("Get Total Value Locked using market stats V2 accounting")
        .option("-i, --token-in <mint>", "Token in mint")
        .option("-o, --token-out <mint>", "Token out mint")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executeMarketTvlV2(opts);
        });

    // market supply
    program
        .command("supply")
        .description("Get circulating supply of ONyc tokens")
        .action(async (_, cmd) => {
            const opts = cmd.optsWithGlobals() as GlobalOptions;
            await executeMarketSupply(opts);
        });

    // market supply-v2
    program
        .command("supply-v2")
        .description("Get circulating supply using excluded balance V2 accounting")
        .action(async (_, cmd) => {
            const opts = cmd.optsWithGlobals() as GlobalOptions;
            await executeMarketSupplyV2(opts);
        });

    // market refresh
    program
        .command("refresh")
        .description("Refresh cached market stats")
        .option("-i, --token-in <mint>", "Token in mint")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executeMarketRefresh(opts);
        });
}

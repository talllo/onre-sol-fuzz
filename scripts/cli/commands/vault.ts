import { Command } from "commander";
import type { GlobalOptions } from "../prompts";
import {
    executeVaultDeposit,
    executeVaultList,
    executeVaultRedemptionDeposit,
    executeVaultRedemptionWithdraw,
    executeVaultSetConfigurableDestination,
    executeVaultWithdraw,
    executeVaultWithdrawConfigurable,
} from "../implementations";

/**
 * Register vault subcommands
 */
export function registerVaultCommands(program: Command): void {
    // vault list
    program
        .command("list")
        .description("List all vault balances (offer, permissionless, redemption)")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executeVaultList(opts);
        });

    // vault deposit
    program
        .command("deposit")
        .description("Deposit tokens to the offer vault")
        .option("-t, --token <mint>", "Token mint")
        .option("-a, --amount <value>", "Amount to deposit (raw)")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals(), tokenMint: options.token } as GlobalOptions & Record<string, any>;
            await executeVaultDeposit(opts);
        });

    // vault withdraw
    program
        .command("withdraw")
        .description("Withdraw tokens from the offer vault")
        .option("-t, --token <mint>", "Token mint")
        .option("-a, --amount <value>", "Amount to withdraw (raw)")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals(), tokenMint: options.token } as GlobalOptions & Record<string, any>;
            await executeVaultWithdraw(opts);
        });

    // vault redemption-deposit
    program
        .command("redemption-deposit")
        .description("Deposit tokens to the redemption vault")
        .option("-t, --token <mint>", "Token mint")
        .option("-a, --amount <value>", "Amount to deposit (raw)")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals(), tokenMint: options.token } as GlobalOptions & Record<string, any>;
            await executeVaultRedemptionDeposit(opts);
        });

    // vault redemption-withdraw
    program
        .command("redemption-withdraw")
        .description("Withdraw tokens from the redemption vault")
        .option("-t, --token <mint>", "Token mint")
        .option("-a, --amount <value>", "Amount to withdraw (raw)")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals(), tokenMint: options.token } as GlobalOptions & Record<string, any>;
            await executeVaultRedemptionWithdraw(opts);
        });

    // vault set-configurable-destination
    program
        .command("set-configurable-destination")
        .description("Set a configurable vault withdrawal destination")
        .option("--kind <kind>", "Vault kind")
        .option("--destination <address>", "Withdrawal destination owner")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals() } as GlobalOptions & Record<string, any>;
            await executeVaultSetConfigurableDestination(opts);
        });

    // vault withdraw-configurable
    program
        .command("withdraw-configurable")
        .description("Withdraw from a configurable accounting vault")
        .option("--kind <kind>", "Vault kind")
        .option("-t, --token <mint>", "Token mint")
        .option("-a, --amount <value>", "Amount to withdraw (raw, 0 = full balance)")
        .action(async (options, cmd) => {
            const opts = { ...options, ...cmd.optsWithGlobals(), tokenMint: options.token } as GlobalOptions & Record<string, any>;
            await executeVaultWithdrawConfigurable(opts);
        });
}

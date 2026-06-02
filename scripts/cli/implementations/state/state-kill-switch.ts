import chalk from "chalk";
import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, confirmDangerousOperation, executeCommand } from "../../helpers";

/**
 * Execute state kill-switch command
 */
export async function executeStateKillSwitch(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, [], async (context) => {
        const enable = opts.disable ? false : true;

        // Confirm dangerous action
        if (enable && !opts.json && !opts.dryRun && !opts.yes) {
            console.log(chalk.red("\nWARNING: This will enable the kill switch!"));
            console.log(chalk.yellow("This is an emergency action that blocks guarded value-moving paths."));
            console.log();

            const confirmed = await confirmDangerousOperation("Are you sure you want to enable the kill switch?", undefined, { requireExactMatch: "ENABLE KILL SWITCH" });

            if (!confirmed) {
                console.log(chalk.yellow("\nOperation cancelled."));
                return;
            }
        }

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const admin = await helper.getBoss();
                return helper.buildSetKillSwitchIx({
                    enable,
                    boss: admin,
                });
            },
            title: `${enable ? "Enable" : "Disable"} Kill Switch Transaction`,
            description: `${enable ? "Enables" : "Disables"} kill switch for guarded value-moving paths`,
        });
    });
}

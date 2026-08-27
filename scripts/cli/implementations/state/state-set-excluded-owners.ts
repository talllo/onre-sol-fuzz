import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { excludedOwnersParams } from "../../params";

export async function executeStateSetExcludedOwners(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, excludedOwnersParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildSetCirculatingSupplyExcludedAccountsIx({
                    owners: params.owners,
                    boss,
                });
            },
            title: "Set Circulating Supply Excluded Owners Transaction",
            description: "Configures owner accounts excluded from circulating supply",
            showParamSummary: {
                title: "Setting excluded owners:",
                params: {
                    owners: params.owners,
                },
            },
        });
    });
}

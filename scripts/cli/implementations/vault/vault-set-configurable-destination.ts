import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { setConfigurableVaultDestinationParams } from "../../params";

export async function executeVaultSetConfigurableDestination(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, setConfigurableVaultDestinationParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildSetConfigurableVaultDestinationIx({
                    kind: params.kind,
                    destination: params.destination,
                    boss,
                });
            },
            title: "Set Configurable Vault Destination Transaction",
            description: "Sets a configurable vault withdrawal destination",
            showParamSummary: {
                title: "Setting configurable vault destination:",
                params: {
                    kind: params.kind,
                    destination: params.destination,
                },
            },
        });
    });
}

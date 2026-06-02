import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { maxMintAmountParams } from "../../params";

export async function executeStateMaxMintAmount(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, maxMintAmountParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildConfigureMaxMintAmountIx({
                    maxMintAmount: params.amount,
                    boss,
                });
            },
            title: "Set Max Mint Amount Transaction",
            description: `Sets maximum mint amount to ${params.amount}`,
            showParamSummary: {
                title: "Setting max mint amount:",
                params: {
                    amount: params.amount,
                },
            },
        });
    });
}

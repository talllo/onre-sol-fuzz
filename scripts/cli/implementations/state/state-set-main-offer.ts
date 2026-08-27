import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { mainOfferParams } from "../../params";

export async function executeStateSetMainOffer(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, mainOfferParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildSetMainOfferIx({
                    offer: params.offer,
                    boss,
                });
            },
            title: "Set Main Offer Transaction",
            description: "Sets the state main offer used for market stats and BUFFER accrual",
            showParamSummary: {
                title: "Setting main offer:",
                params: {
                    offer: params.offer,
                },
            },
        });
    });
}

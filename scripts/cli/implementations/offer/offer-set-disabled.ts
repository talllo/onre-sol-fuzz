import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { setOfferDisabledParams } from "../../params";

export async function executeOfferSetDisabled(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, setOfferDisabledParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => helper.buildSetOfferDisabledIx({
                tokenInMint: params.tokenIn,
                tokenOutMint: params.tokenOut,
                disabled: params.disabled,
                signer: helper.wallet.publicKey,
            }),
            payer: context.helper.wallet.publicKey,
            title: "Set Offer Disabled Transaction",
            description: `${params.disabled ? "Disables" : "Enables"} an offer`,
            showParamSummary: {
                title: "Setting offer disabled state:",
                params: {
                    tokenIn: params.tokenIn,
                    tokenOut: params.tokenOut,
                    disabled: params.disabled,
                },
            },
        });
    });
}

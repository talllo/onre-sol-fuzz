import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { setRedemptionDisabledParams } from "../../params";

export async function executeRedemptionSetDisabled(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, setRedemptionDisabledParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => helper.buildSetRedemptionOfferDisabledIx({
                redemptionOfferPda: helper.getRedemptionOfferPda(params.tokenIn, params.tokenOut),
                disabled: params.disabled,
                signer: helper.wallet.publicKey,
            }),
            payer: context.helper.wallet.publicKey,
            title: "Set Redemption Offer Disabled Transaction",
            description: `${params.disabled ? "Disables" : "Enables"} a redemption offer`,
            showParamSummary: {
                title: "Setting redemption offer disabled state:",
                params: {
                    tokenIn: params.tokenIn,
                    tokenOut: params.tokenOut,
                    disabled: params.disabled,
                },
            },
        });
    });
}

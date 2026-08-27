import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { updateRedemptionVaultTargetParams } from "../../params";

export async function executeRedemptionUpdateVaultTarget(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, updateRedemptionVaultTargetParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildUpdateRedemptionOfferVaultTargetIx({
                    redemptionOfferPda: helper.getRedemptionOfferPda(params.tokenIn, params.tokenOut),
                    vaultTargetBps: params.vaultTargetBps,
                    boss,
                });
            },
            title: "Update Redemption Vault Target Transaction",
            description: `Updates redemption vault target to ${params.vaultTargetBps} bps`,
            showParamSummary: {
                title: "Updating redemption vault target:",
                params: {
                    tokenIn: params.tokenIn,
                    tokenOut: params.tokenOut,
                    targetBps: params.vaultTargetBps,
                },
            },
        });
    });
}

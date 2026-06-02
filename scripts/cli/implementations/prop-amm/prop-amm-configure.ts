import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { propAmmConfigureParams } from "../../params";

export async function executePropAmmConfigure(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, propAmmConfigureParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildConfigurePropAmmIx({
                    assetMint: params.assetMint,
                    enabled: params.enabled,
                    curvePegHaircutBps: params.curvePegHaircutBps,
                    curveExponentScaled: params.curveExponentScaled,
                    minCadenceExponentScaled: params.minCadenceExponentScaled,
                    cadenceThreshold: params.cadenceThreshold,
                    cadenceSensitivityScaled: params.cadenceSensitivityScaled,
                    epochDurationSeconds: params.epochDurationSeconds,
                    wallSensitivityScaled: params.wallSensitivityScaled,
                    minimumSellHaircutOnyc: params.minimumSellHaircutOnyc,
                    boss,
                });
            },
            title: "Configure Prop AMM Transaction",
            description: "Configures a Prop AMM pair",
            showParamSummary: {
                title: "Configuring Prop AMM:",
                params: {
                    assetMint: params.assetMint,
                    enabled: params.enabled,
                    curvePegHaircutBps: params.curvePegHaircutBps,
                    curveExponentScaled: params.curveExponentScaled,
                    minCadenceExponentScaled: params.minCadenceExponentScaled,
                    cadenceThreshold: params.cadenceThreshold,
                    cadenceSensitivityScaled: params.cadenceSensitivityScaled,
                    epochDurationSeconds: params.epochDurationSeconds,
                    wallSensitivityScaled: params.wallSensitivityScaled,
                    minimumSellHaircutOnyc: params.minimumSellHaircutOnyc,
                },
            },
        });
    });
}

import type { GlobalOptions } from "../../prompts";
import { buildAndHandleTransaction, executeCommand } from "../../helpers";
import { bufferFeeConfigParams } from "../../params";

export async function executeBufferSetFees(opts: GlobalOptions & Record<string, any>): Promise<void> {
    await executeCommand(opts, bufferFeeConfigParams, async (context) => {
        const { params } = context;

        await buildAndHandleTransaction(context, {
            buildIx: async (helper) => {
                const boss = await helper.getBoss();
                return helper.buildSetBufferFeeConfigIx({
                    managementFeeBps: params.managementFeeBps,
                    performanceFeeBps: params.performanceFeeBps,
                    performanceFeeHighWatermarkEnabled: params.performanceFeeHighWatermarkEnabled,
                    boss,
                });
            },
            title: "Set BUFFER Fee Config Transaction",
            description: "Updates BUFFER management and performance fee settings and high-water-mark behavior",
            showParamSummary: {
                title: "Setting BUFFER fees:",
                params: {
                    managementFeeBps: params.managementFeeBps,
                    performanceFeeBps: params.performanceFeeBps,
                    performanceFeeHighWatermarkEnabled: params.performanceFeeHighWatermarkEnabled,
                },
            },
        });
    });
}

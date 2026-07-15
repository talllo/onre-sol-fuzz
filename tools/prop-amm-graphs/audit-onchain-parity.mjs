import fs from "node:fs";

const source = fs.readFileSync(process.argv[2], "utf8");

function extractConstant(name) {
    const match = source.match(new RegExp(`^\\s*const ${name} = [^;]+;`, "m"));
    if (!match) throw new Error(`Missing constant ${name}`);
    return match[0].trim();
}

function extractFunction(name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Missing function ${name}`);
    const opening = source.indexOf("{", start);
    let depth = 0;
    for (let index = opening; index < source.length; index += 1) {
        if (source[index] === "{") depth += 1;
        if (source[index] === "}") depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unterminated function ${name}`);
}

const constantNames = [
    "HARD_WALL_SCALE",
    "CURVE_EXPONENT_SCALE",
    "CADENCE_WAVE_SCALE",
    "CADENCE_WAVE_EASE",
    "CADENCE_WAVE_CAP_DIVISOR",
    "POW_APPROX_Q_SHIFT",
    "POW_APPROX_Q",
    "POW_APPROX_LN2_Q",
    "POW_APPROX_LOG2_E_Q",
    "LOG2_HARD_WALL_SCALE_Q",
    "U128_MAX",
    "WALL_SENSITIVITY_SCALE",
    "MAX_BPS",
];
const functionNames = [
    "previewEffectiveSellVolume",
    "dynamicWallPosition",
    "dynamicWallLiquidity",
    "saturatingAdd",
    "saturatingMul",
    "mulScaled",
    "utilizationPowerScaled",
    "integerUtilizationPowerScaled",
    "log2HardWallScaledQ",
    "log2IntegerQ",
    "exp2HardWallScaledQ",
    "bpsToScale",
    "redemptionHaircutScaled",
    "clampScaled",
    "cadenceWaveYForQuoteScaled",
    "cadenceWaveTargetHaircutScaled",
    "applyHardWallLiquidityFactor",
    "previewCurrentSellTradeCount",
    "roll",
    "recordSell",
];

const oracle = Function(
    [
        ...constantNames.map(extractConstant),
        ...functionNames.map(extractFunction),
        "return { cadenceWaveYForQuoteScaled, cadenceWaveTargetHaircutScaled, applyHardWallLiquidityFactor, roll, recordSell };",
    ].join("\n"),
)();

const lines = fs.readFileSync(0, "utf8").trim().split("\n");
let targetCases = 0;
let cadenceCases = 0;
let fullCurveCases = 0;
let transitionCases = 0;
const mismatches = [];

for (const line of lines) {
    const fields = line.split("\t");
    if (fields[0] === "T") {
        const actual = oracle.cadenceWaveTargetHaircutScaled(BigInt(fields[1]), BigInt(fields[2]));
        if (actual.toString() !== fields[3]) mismatches.push({ line, actual: actual.toString() });
        targetCases += 1;
    } else if (fields[0] === "Y") {
        const amm = {
            cadenceThreshold: Number(fields[1]),
            cadenceWaveScaled: Number(fields[2]),
            currSellTradeCount: Number(fields[3]),
            epochDuration: BigInt(fields[4]),
            epochStart: BigInt(fields[5]),
        };
        const actual = oracle.cadenceWaveYForQuoteScaled(amm, BigInt(fields[6]));
        if (actual.toString() !== fields[7]) mismatches.push({ line, actual: actual.toString() });
        cadenceCases += 1;
    } else if (fields[0] === "F") {
        const amm = {
            pegHaircutBps: Number(fields[4]),
            curveExponentScaled: Number(fields[5]),
            cadenceThreshold: Number(fields[6]),
            cadenceWaveScaled: Number(fields[7]),
            epochDuration: BigInt(fields[8]),
            wallSensitivityScaled: Number(fields[9]),
            currSell: BigInt(fields[10]),
            currBuy: BigInt(fields[11]),
            prevNetSell: BigInt(fields[12]),
            currSellTradeCount: Number(fields[13]),
            epochStart: BigInt(fields[14]),
        };
        const quote = oracle.applyHardWallLiquidityFactor(
            BigInt(fields[1]),
            BigInt(fields[2]),
            BigInt(fields[3]),
            amm,
            BigInt(fields[15]),
        );
        if (!quote.ok || quote.output.toString() !== fields[16]) {
            mismatches.push({ line, actual: quote.ok ? quote.output.toString() : quote.reason });
        }
        fullCurveCases += 1;
    } else if (fields[0] === "R") {
        const amm = {
            epochDuration: BigInt(fields[4]),
            epochStart: BigInt(fields[5]),
            currSell: BigInt(fields[6]),
            currBuy: BigInt(fields[7]),
            prevNetSell: BigInt(fields[8]),
            currSellTradeCount: Number(fields[9]),
        };
        if (fields[1] === "0") {
            oracle.roll(amm, BigInt(fields[2]));
        } else {
            oracle.recordSell(amm, BigInt(fields[3]), BigInt(fields[2]));
        }
        const actual = [
            amm.epochStart.toString(),
            amm.currSell.toString(),
            amm.currBuy.toString(),
            amm.prevNetSell.toString(),
            amm.currSellTradeCount.toString(),
        ];
        if (actual.some((value, index) => value !== fields[index + 10])) {
            mismatches.push({ line, actual });
        }
        transitionCases += 1;
    }
    if (mismatches.length >= 20) break;
}

if (
    targetCases !== 102_052 ||
    cadenceCases !== 63_750 ||
    fullCurveCases !== 51_000 ||
    transitionCases !== 50_000
) {
    mismatches.push({
        expectedCounts: { targetCases: 102_052, cadenceCases: 63_750, fullCurveCases: 51_000, transitionCases: 50_000 },
        actualCounts: { targetCases, cadenceCases, fullCurveCases, transitionCases },
    });
}

if (mismatches.length > 0) {
    console.error(JSON.stringify({ targetCases, cadenceCases, fullCurveCases, mismatches }, null, 2));
    process.exit(1);
}

console.log(JSON.stringify({ targetCases, cadenceCases, fullCurveCases, transitionCases, mismatches: 0 }));

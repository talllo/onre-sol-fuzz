import { PublicKey } from "@solana/web3.js";

import { SmokeRuntime } from "./runtime";

type NumericLike = {
    toString(): string;
};

type EqNumericLike = NumericLike & {
    eq(other: NumericLike): boolean;
};

export async function tokenBalance(runtime: SmokeRuntime, tokenAccount: PublicKey): Promise<bigint> {
    const balance = await runtime.connection.getTokenAccountBalance(tokenAccount).catch(() => null);
    return BigInt(balance?.value.amount ?? "0");
}

export function bnToBigInt(value: NumericLike): bigint {
    return BigInt(value.toString());
}

export function assertPublicKeyEq(actual: PublicKey, expected: PublicKey, label: string): void {
    if (!actual.equals(expected)) {
        throw new Error(`${label}: expected ${expected.toBase58()}, got ${actual.toBase58()}`);
    }
}

export function assertBnEq(actual: EqNumericLike, expected: EqNumericLike, label: string): void {
    if (!actual.eq(expected)) {
        throw new Error(`${label}: expected ${expected.toString()}, got ${actual.toString()}`);
    }
}

export function assertBigIntEq(actual: bigint, expected: bigint, label: string): void {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

export function assertBigIntGt(actual: bigint, floor: bigint, label: string): void {
    if (actual <= floor) {
        throw new Error(`${label}: expected > ${floor}, got ${actual}`);
    }
}

export function assertBigIntGte(actual: bigint, floor: bigint, label: string): void {
    if (actual < floor) {
        throw new Error(`${label}: expected >= ${floor}, got ${actual}`);
    }
}

export function assertBigIntLte(actual: bigint, ceiling: bigint, label: string): void {
    if (actual > ceiling) {
        throw new Error(`${label}: expected <= ${ceiling}, got ${actual}`);
    }
}

export function assertBigIntLt(actual: bigint, ceiling: bigint, label: string): void {
    if (actual >= ceiling) {
        throw new Error(`${label}: expected < ${ceiling}, got ${actual}`);
    }
}

export function assertNumberEq(actual: number, expected: number, label: string): void {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

export function assertNumberGt(actual: number, floor: number, label: string): void {
    if (actual <= floor) {
        throw new Error(`${label}: expected > ${floor}, got ${actual}`);
    }
}

export function assertNumberGte(actual: number, floor: number, label: string): void {
    if (actual < floor) {
        throw new Error(`${label}: expected >= ${floor}, got ${actual}`);
    }
}

export function assertTruthy(value: boolean, label: string): void {
    if (!value) {
        throw new Error(label);
    }
}

export async function assertNoTokenBalance(runtime: SmokeRuntime, tokenAccount: PublicKey, label: string): Promise<void> {
    const amount = await tokenBalance(runtime, tokenAccount);
    assertBigIntEq(amount, 0n, label);
}

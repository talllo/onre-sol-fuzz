import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import { typeByName } from "./constants";
import { errorMessage, normalizeName } from "./format";
import type { IdlArg, IdlInstruction, IdlType, IdlTypeDef, PrimitiveIdlType } from "./types";

export function encodeType(type: IdlType, value: unknown): Buffer {
    if (typeof type === "string") {
        return encodePrimitive(type, value);
    }

    if ("option" in type) {
        if (value === null || value === undefined || value === "") return Buffer.from([0]);
        return Buffer.concat([Buffer.from([1]), encodeType(type.option, value)]);
    }

    if ("vec" in type) {
        const arr = Array.isArray(value) ? value : JSON.parse(String(value || "[]"));
        return Buffer.concat([encodeU32(arr.length), ...arr.map((item: unknown) => encodeType(type.vec, item))]);
    }

    if ("array" in type) {
        const arr = Array.isArray(value) ? value : JSON.parse(String(value || "[]"));
        const [inner, length] = type.array;
        if (arr.length !== length) throw new Error(`Expected array length ${length}`);
        return Buffer.concat(arr.map((item: unknown) => encodeType(inner, item)));
    }

    if ("defined" in type) {
        return encodeDefined(type.defined.name, value);
    }

    throw new Error(`Unsupported IDL type: ${JSON.stringify(type)}`);
}

function encodePrimitive(type: PrimitiveIdlType, value: unknown): Buffer {
    if (type === "bool") return Buffer.from([parseBoolean(value) ? 1 : 0]);
    if (type === "pubkey") return new PublicKey(String(value)).toBuffer();
    if (type === "string") {
        const bytes = Buffer.from(String(value), "utf8");
        return Buffer.concat([encodeU32(bytes.length), bytes]);
    }

    const size = integerByteLength(type);
    if (!size) throw new Error(`Unsupported primitive type: ${type}`);
    return encodeInteger(value, size, type.startsWith("i"));
}

function encodeDefined(name: string, value: unknown): Buffer {
    const typeDef = typeByName.get(name);
    if (!typeDef) throw new Error(`Unknown defined type: ${name}`);

    if (typeDef.type.kind === "struct") {
        const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        return Buffer.concat(typeDef.type.fields.map((field) => encodeType(field.type, object[field.name])));
    }

    const variant = resolveEnumVariant(typeDef, value);
    const index = typeDef.type.variants.findIndex((candidate) => candidate.name === variant.name);
    const fields = variant.fields ?? [];
    const payload = Array.isArray(fields) ? encodeEnumFields(fields, variant.value) : Buffer.alloc(0);
    return Buffer.concat([Buffer.from([index]), payload]);
}

function resolveEnumVariant(typeDef: IdlTypeDef, value: unknown): { name: string; fields?: IdlArg[] | IdlType[]; value?: unknown } {
    if (typeDef.type.kind !== "enum") throw new Error(`${typeDef.name} is not an enum`);
    const variants = typeDef.type.variants;

    if (typeof value === "string") {
        const parsed = value.trim().startsWith("{") ? JSON.parse(value) : value;
        return resolveEnumVariant(typeDef, parsed);
    }

    if (value && typeof value === "object") {
        const object = value as Record<string, unknown>;
        const key = Object.keys(object)[0];
        const variant = variants.find((candidate) => normalizeName(candidate.name) === normalizeName(key));
        if (!variant) throw new Error(`Invalid ${typeDef.name} variant: ${key}`);
        return { ...variant, value: object[key] };
    }

    const variant = variants.find((candidate) => normalizeName(candidate.name) === normalizeName(String(value)));
    if (!variant) throw new Error(`Invalid ${typeDef.name} variant: ${String(value)}`);
    return variant;
}

function encodeEnumFields(fields: IdlArg[] | IdlType[], value: unknown): Buffer {
    if (!fields.length) return Buffer.alloc(0);
    if (isIdlArg(fields[0])) {
        const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        return Buffer.concat((fields as IdlArg[]).map((field) => encodeType(field.type, object[field.name])));
    }
    const arr = Array.isArray(value) ? value : [value];
    return Buffer.concat((fields as IdlType[]).map((field, index) => encodeType(field, arr[index])));
}

function isIdlArg(value: IdlArg | IdlType): value is IdlArg {
    return Boolean(value && typeof value === "object" && "name" in value && "type" in value);
}

export function decodeReturnData(instruction: IdlInstruction, base64: string): unknown {
    if (!instruction.returns) return { rawBase64: base64 };

    const bytes = Buffer.from(base64, "base64");

    return [0, 8]
        .filter((offset) => offset < bytes.length)
        .map((offset) => {
            try {
                const [value, nextOffset] = decodeType(instruction.returns!, bytes, offset);
                return { offset, value, consumed: nextOffset - offset };
            } catch (error) {
                return { offset, error: errorMessage(error) };
            }
        });
}

function decodeType(type: IdlType, bytes: Buffer, offset: number): [unknown, number] {
    if (typeof type === "string") {
        if (type === "bool") return [bytes[offset] !== 0, offset + 1];
        if (type === "pubkey") return [new PublicKey(bytes.subarray(offset, offset + 32)).toBase58(), offset + 32];
        if (type === "string") {
            const [length, afterLength] = decodeType("u32", bytes, offset) as [number, number];
            return [bytes.subarray(afterLength, afterLength + length).toString("utf8"), afterLength + length];
        }
        const size = integerByteLength(type);
        if (!size) throw new Error(`Unsupported return primitive: ${type}`);
        return [decodeInteger(bytes.subarray(offset, offset + size), type.startsWith("i")), offset + size];
    }

    if ("option" in type) {
        const present = bytes[offset] === 1;
        if (!present) return [null, offset + 1];
        return decodeType(type.option, bytes, offset + 1);
    }

    if ("vec" in type) {
        const [length, start] = decodeType("u32", bytes, offset) as [number, number];
        const values: unknown[] = [];
        let cursor = start;
        for (let i = 0; i < length; i++) {
            const [value, next] = decodeType(type.vec, bytes, cursor);
            values.push(value);
            cursor = next;
        }
        return [values, cursor];
    }

    if ("defined" in type) {
        return decodeDefined(type.defined.name, bytes, offset);
    }

    throw new Error(`Unsupported return type: ${JSON.stringify(type)}`);
}

function decodeDefined(name: string, bytes: Buffer, offset: number): [unknown, number] {
    const typeDef = typeByName.get(name);
    if (!typeDef) throw new Error(`Unknown defined type: ${name}`);

    if (typeDef.type.kind === "struct") {
        const object: Record<string, unknown> = {};
        let cursor = offset;
        for (const field of typeDef.type.fields) {
            const [value, next] = decodeType(field.type, bytes, cursor);
            object[field.name] = value;
            cursor = next;
        }
        return [object, cursor];
    }

    const index = bytes[offset];
    const variant = typeDef.type.variants[index];
    if (!variant) throw new Error(`Invalid enum variant index: ${index}`);
    return [{ [variant.name]: {} }, offset + 1];
}

function encodeInteger(value: unknown, byteLength: number, signed: boolean): Buffer {
    let bigint = BigInt(String(value || "0"));
    const max = 1n << BigInt(byteLength * 8);
    if (signed && bigint < 0) {
        bigint = max + bigint;
    }

    const buffer = Buffer.alloc(byteLength);
    for (let i = 0; i < byteLength; i++) {
        buffer[i] = Number((bigint >> BigInt(i * 8)) & 0xffn);
    }
    return buffer;
}

function decodeInteger(bytes: Buffer, signed: boolean): string | number {
    let value = 0n;
    for (let i = 0; i < bytes.length; i++) {
        value |= BigInt(bytes[i]) << BigInt(i * 8);
    }
    if (signed) {
        const signBit = 1n << BigInt(bytes.length * 8 - 1);
        if (value & signBit) {
            value -= 1n << BigInt(bytes.length * 8);
        }
    }
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
}

function encodeU32(value: number): Buffer {
    return encodeInteger(value, 4, false);
}

function integerByteLength(type: string): number | undefined {
    switch (type) {
        case "u8":
            return 1;
        case "u16":
            return 2;
        case "u32":
            return 4;
        case "u64":
        case "i64":
            return 8;
        default:
            return undefined;
    }
}

export function defaultArgValue(type: IdlType): string {
    if (type === "bool") return "false";
    if (type === "pubkey") return "";
    if (type === "string") return "";
    if (typeof type === "string") return "0";
    if ("option" in type) return "null";
    if ("vec" in type) return "[]";
    if ("array" in type) return "[]";
    if ("defined" in type) {
        const typeDef = typeByName.get(type.defined.name);
        if (typeDef?.type.kind === "enum") return typeDef.type.variants[0]?.name ?? "";
        if (typeDef?.type.kind === "struct") {
            return JSON.stringify(Object.fromEntries(typeDef.type.fields.map((field) => [field.name, defaultJsonValue(field.type)])), null, 2);
        }
    }
    return "";
}

function defaultJsonValue(type: IdlType): unknown {
    if (type === "bool") return false;
    if (type === "pubkey" || type === "string") return "";
    if (typeof type === "string") return "0";
    if ("option" in type) return null;
    if ("vec" in type || "array" in type) return [];
    if ("defined" in type) return {};
    return null;
}

export function typeLabel(type: IdlType): string {
    if (typeof type === "string") return type;
    if ("option" in type) return `option<${typeLabel(type.option)}>`;
    if ("vec" in type) return `vec<${typeLabel(type.vec)}>`;
    if ("array" in type) return `[${typeLabel(type.array[0])}; ${type.array[1]}]`;
    if ("defined" in type) return type.defined.name;
    return "unknown";
}

export function enumTypeDef(type: IdlType): IdlTypeDef | undefined {
    if (typeof type === "string" || !("defined" in type)) return undefined;
    const typeDef = typeByName.get(type.defined.name);
    return typeDef?.type.kind === "enum" ? typeDef : undefined;
}

export function isDefinedType(type: IdlType, name: string): boolean {
    return typeof type !== "string" && "defined" in type && type.defined.name === name;
}

export function parseBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    return String(value).toLowerCase() === "true" || String(value) === "1";
}

export function displayName(name: string): string {
    return name.replaceAll("_", " ");
}

export function normalizeName(name: string): string {
    return name.replaceAll("_", "").replaceAll("-", "").toLowerCase();
}

export function compactAddress(value: string): string {
    return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-8)}` : value;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function jsonReplacer(_key: string, value: unknown): unknown {
    return typeof value === "bigint" ? value.toString() : value;
}

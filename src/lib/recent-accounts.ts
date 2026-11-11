export interface RecentAccount {
  id: string;
  name: string;
  email: string;
}

export const RECENT_ACCOUNTS_KEY = "imovelink.recent-accounts";
const MAX_RECENT_ACCOUNTS = 3;

function accountFrom(value: unknown): RecentAccount | null {
  if (!value || typeof value !== "object") return null;
  const account = value as Record<string, unknown>;
  if (
    typeof account.id !== "string" ||
    !account.id ||
    typeof account.name !== "string" ||
    !account.name.trim() ||
    typeof account.email !== "string" ||
    !account.email.includes("@")
  )
    return null;
  return { id: account.id, name: account.name, email: account.email };
}

export function readRecentAccounts(): RecentAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(RECENT_ACCOUNTS_KEY);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .map(accountFrom)
      .filter((account): account is RecentAccount => {
        if (!account || seen.has(account.email.toLowerCase())) return false;
        seen.add(account.email.toLowerCase());
        return true;
      })
      .slice(0, MAX_RECENT_ACCOUNTS);
  } catch {
    return [];
  }
}

export function writeRecentAccounts(accounts: RecentAccount[]): void {
  if (typeof window === "undefined") return;
  try {
    const safeAccounts = accounts
      .map(accountFrom)
      .filter((account): account is RecentAccount => account !== null)
      .slice(0, MAX_RECENT_ACCOUNTS);
    window.localStorage.setItem(
      RECENT_ACCOUNTS_KEY,
      JSON.stringify(safeAccounts),
    );
  } catch {
    // O login continua disponível quando o armazenamento do navegador está bloqueado.
  }
}

export function rememberRecentAccount(account: RecentAccount): void {
  const safeAccount = accountFrom(account);
  if (!safeAccount) return;
  const others = readRecentAccounts().filter(
    (item) =>
      item.id !== safeAccount.id &&
      item.email.toLowerCase() !== safeAccount.email.toLowerCase(),
  );
  writeRecentAccounts([safeAccount, ...others]);
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { RefreshDouble, Xmark } from "iconoir-react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { LoginCarousel } from "@/components/login/login-carousel";
import { useTenantStore } from "@/store/tenant-store";
import {
  readRecentAccounts,
  rememberRecentAccount,
  writeRecentAccounts,
  type RecentAccount,
} from "@/lib/recent-accounts";

export default function LoginPage() {
  const router = useRouter();
  const { loginAsUser } = useTenantStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const passwordInput = useRef<HTMLInputElement>(null);
  const loginInProgress = useRef(false);
  const pendingForget = useRef<Promise<void>>(Promise.resolve());
  const [loggingAccountId, setLoggingAccountId] = useState<string | null>(null);

  useEffect(() => {
    setRecentAccounts(readRecentAccounts());
  }, []);

  useEffect(() => {
    if (!loading && errorMsg) passwordInput.current?.focus();
  }, [loading, errorMsg]);

  const authenticate = async (
    credentials:
      | { action: "LOGIN"; email: string; password: string }
      | { action: "QUICK_LOGIN"; userId: string },
  ) => {
    if (loginInProgress.current) return;
    loginInProgress.current = true;
    setLoading(true);
    setLoggingAccountId(
      credentials.action === "QUICK_LOGIN" ? credentials.userId : null,
    );
    setErrorMsg(null);
    try {
      await pendingForget.current;
      const res = await fetch("/api/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Credenciais inválidas.");
        return;
      }
      loginAsUser(data.user, data.tenant);
      rememberRecentAccount(data.user);
      router.push("/");
      router.refresh();
    } catch {
      setErrorMsg("Não foi possível conectar ao servidor.");
    } finally {
      loginInProgress.current = false;
      setLoading(false);
      setLoggingAccountId(null);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    await authenticate({ action: "LOGIN", email, password });
  };

  return (
    <div className="login-page">
      <main className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-brand">
            <Brand />
          </div>
          <h1>Boas-vindas ao Imovelink</h1>
          <p className="login-intro">
            Gerencie seus imóveis e acompanhe sua imobiliária.
          </p>
          {errorMsg && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs"
            >
              {errorMsg}
            </div>
          )}
          <form onSubmit={handleLogin} className="login-form">
            <div>
              <label htmlFor="login-email">E-mail de acesso</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                disabled={loading}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Digite seu email"
              />
            </div>
            <div>
              <label htmlFor="login-password">Senha</label>
              <input
                id="login-password"
                ref={passwordInput}
                type="password"
                autoComplete="current-password"
                disabled={loading}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="button-primary"
              aria-busy={loading && !loggingAccountId}
            >
              {loading && !loggingAccountId ? "Entrando…" : "Entrar"}
            </button>
          </form>
          {recentAccounts.length > 0 && (
            <section
              className="recent-accounts"
              aria-labelledby="recent-accounts-heading"
            >
              <h2 id="recent-accounts-heading">Acessos recentes</h2>
              <ul className="recent-account-list">
                {recentAccounts.map((account) => {
                  const names = account.name.trim().split(/\s+/);
                  const displayName =
                    names.length > 1
                      ? `${names[0]} ${names[names.length - 1]}`
                      : names[0];
                  const initials =
                    names.length > 1
                      ? `${names[0][0]}${names[names.length - 1][0]}`
                      : names[0].slice(0, 2);
                  const selected = loggingAccountId
                    ? loggingAccountId === account.id
                    : email.toLowerCase() === account.email.toLowerCase();
                  return (
                    <li
                      key={account.id}
                      className={`recent-account${selected ? " is-selected" : ""}`}
                    >
                      <button
                        type="button"
                        className="recent-account-select"
                        disabled={loading}
                        aria-label={`Usar conta de ${account.name}`}
                        aria-pressed={selected}
                        aria-busy={loggingAccountId === account.id}
                        onClick={() => {
                          void authenticate({
                            action: "QUICK_LOGIN",
                            userId: account.id,
                          });
                        }}
                      >
                        <span
                          className="recent-account-avatar"
                          aria-hidden="true"
                        >
                          {loggingAccountId === account.id ? (
                            <RefreshDouble
                              aria-hidden="true"
                              width={18}
                              height={18}
                              className="recent-account-spinner"
                            />
                          ) : (
                            initials.toUpperCase()
                          )}
                        </span>
                        <span className="recent-account-info">
                          <strong title={account.name}>{displayName}</strong>
                          <span
                            title={account.email}
                            role={
                              loggingAccountId === account.id
                                ? "status"
                                : undefined
                            }
                          >
                            {loggingAccountId === account.id
                              ? "Entrando…"
                              : account.email}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="recent-account-remove"
                        disabled={loading}
                        aria-label={`Remover ${account.name} das contas recentes`}
                        title="Remover da lista"
                        onClick={() => {
                          const remaining = recentAccounts.filter(
                            (item) => item.id !== account.id,
                          );
                          setRecentAccounts(remaining);
                          writeRecentAccounts(remaining);
                          pendingForget.current = pendingForget.current.then(
                            async () => {
                              try {
                                await fetch("/api/auth", {
                                  method: "POST",
                                  credentials: "same-origin",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "FORGET_RECENT",
                                    userId: account.id,
                                  }),
                                });
                              } catch {
                                /* A remoção local continua funcionando sem conexão. */
                              }
                            },
                          );
                          if (selected) {
                            setEmail("");
                            setPassword("");
                          }
                        }}
                      >
                        <Xmark width={14} height={14} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </main>
      <LoginCarousel />
    </div>
  );
}

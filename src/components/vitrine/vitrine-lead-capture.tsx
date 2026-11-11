"use client";

import React, { useState } from "react";
import { CheckCircle, Search } from "iconoir-react";
import { HybridSearchResultItem } from "@/types/domain";

export function VitrineLeadCapture({ tenantId }: { tenantId: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [desire, setDesire] = useState(
    "Procuro casa com quintal arborizado, 3 quartos e espaço gourmet no Centro ou Vila Nova até 950 mil",
  );
  const [loading, setLoading] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    aiScore: number;
    matches: HybridSearchResultItem[];
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          name: name || "Visitante Portal B2B",
          phone: phone || "(47) 99922-3344",
          email: email || "visitante@portalb2b.com.br",
          originChannel: "PORTAL_B2B",
          naturalSearchDesire: desire,
        }),
      });
      const data = await res.json();
      setSubmittedResult({
        aiScore: data.lead?.aiScore ?? 90,
        matches: data.matchedProperties ?? [],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 p-6 lg:p-8 space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">Buscar imóveis</h2>
      </div>

      {!submittedResult ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <input
              type="text"
              aria-label="Seu nome"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome *"
              className="field-control"
            />
            <input
              type="text"
              aria-label="Seu WhatsApp"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Seu WhatsApp (47) 99999-9999 *"
              className="field-control"
            />
            <input
              type="email"
              aria-label="Seu e-mail (opcional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Seu e-mail (opcional)"
              className="field-control"
            />
          </div>

          <textarea
            rows={3}
            aria-label="Descreva o imóvel que você procura"
            required
            value={desire}
            onChange={(e) => setDesire(e.target.value)}
            className="field-control"
            placeholder="Ex: Quero uma casa com quintal arborizado, espaço gourmet e 3 suítes até 950 mil..."
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              Seus dados são protegidos conforme a LGPD (Lei nº 13.709/2018).
            </span>
            <button type="submit" disabled={loading} className="button-primary">
              <Search aria-hidden="true" className="w-3.5 h-3.5" />
              {loading ? "Buscando..." : "Ver Imóveis Compatíveis"}
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 rounded-xl bg-brand-50/50 border border-brand-100 space-y-4">
          <div className="flex items-center gap-2 text-brand-800 font-medium text-sm">
            <CheckCircle
              aria-hidden="true"
              className="w-4 h-4 text-brand-600"
            />
            <span>
              Encontramos os imóveis mais compatíveis para você (Score IA:{" "}
              {submittedResult.aiScore}/100):
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {submittedResult.matches.map((m) => (
              <div
                key={m.property.id}
                className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-1"
              >
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">{m.property.code}</span>
                  <span className="text-brand-600">
                    {m.hybridScore}% Compatível
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-900 truncate">
                  {m.property.title}
                </p>
                <p className="text-xs text-slate-500">
                  {m.property.addressNeighborhood} • R${" "}
                  {m.property.price.toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle, Search } from "iconoir-react";
import type { HybridSearchResultItem, Property } from "@/types/domain";

const EVENTO_INTERESSE = "vitrine:interesse";

/** O card avisa o formulário de qual imóvel o visitante quer saber mais. */
export function pedirInteresse(imovel: Pick<Property, "code" | "title">) {
  window.dispatchEvent(
    new CustomEvent(EVENTO_INTERESSE, {
      detail: `Tenho interesse no imóvel ${imovel.code}: ${imovel.title}.`,
    }),
  );
}

export function VitrineLeadCapture({ tenantId }: { tenantId: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [desire, setDesire] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<HybridSearchResultItem[] | null>(
    null,
  );

  useEffect(() => {
    const preencher = (evento: Event) => {
      setDesire((evento as CustomEvent<string>).detail);
      setMatches(null);
    };
    window.addEventListener(EVENTO_INTERESSE, preencher);
    return () => window.removeEventListener(EVENTO_INTERESSE, preencher);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          name,
          phone,
          email,
          originChannel: "PORTAL_B2B",
          naturalSearchDesire: desire,
        }),
      });
      const data = await res.json();
      // Uma recusa do servidor não pode ser mostrada como contato registrado.
      if (!res.ok) {
        setError(data.error ?? "Não foi possível enviar seu contato.");
        return;
      }
      setMatches(data.matchedProperties ?? []);
    } catch {
      setError("Não foi possível enviar seu contato. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (matches)
    return (
      <div className="vitrine-formulario" role="status">
        <p className="vitrine-formulario-sucesso">
          <CheckCircle aria-hidden="true" width={20} height={20} />
          Recebemos seu pedido, {name.split(" ")[0]}. Um corretor vai falar com
          você em breve.
        </p>
        {matches.length > 0 && (
          <>
            <p className="vitrine-formulario-dica">
              Enquanto isso, estes imóveis combinam com o que você descreveu:
            </p>
            <ul className="vitrine-sugestoes">
              {matches.map((m) => (
                <li key={m.property.id}>
                  <a href={`#${m.property.code}`}>
                    <strong>{m.property.title}</strong>
                    <span>
                      {m.property.addressNeighborhood} · R${" "}
                      {m.property.price.toLocaleString("pt-BR")}
                    </span>
                  </a>
                  <span className="vitrine-sugestao-nota">
                    {m.hybridScore}% compatível
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );

  return (
    <form onSubmit={handleSubmit} className="vitrine-formulario">
      <label className="vitrine-campo vitrine-campo-inteiro">
        <span>O que você procura? *</span>
        <textarea
          rows={4}
          required
          value={desire}
          onChange={(e) => setDesire(e.target.value)}
          className="field-control"
          placeholder="Ex.: casa com quintal, 3 quartos e espaço gourmet no Centro ou na Vila Nova, até R$ 950 mil"
        />
      </label>
      <label className="vitrine-campo">
        <span>Seu nome *</span>
        <input
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field-control"
        />
      </label>
      <label className="vitrine-campo">
        <span>Telefone *</span>
        <input
          type="tel"
          required
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(47) 99999-9999"
          className="field-control"
        />
      </label>
      <label className="vitrine-campo vitrine-campo-inteiro">
        <span>E-mail (opcional)</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field-control"
        />
      </label>

      {error && (
        <p role="alert" className="vitrine-formulario-erro">
          {error}
        </p>
      )}

      <div className="vitrine-formulario-rodape">
        <span>Seus dados são protegidos conforme a LGPD.</span>
        <button
          type="submit"
          disabled={loading}
          className="vitrine-botao vitrine-botao-cheio"
        >
          <Search aria-hidden="true" width={16} height={16} />
          {loading ? "Buscando…" : "Encontrar imóveis"}
        </button>
      </div>
    </form>
  );
}

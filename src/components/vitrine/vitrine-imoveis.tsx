"use client";

import React, { useMemo, useState } from "react";
import { Bathroom, Bed, Car, ChatBubble, Expand, MapPin } from "iconoir-react";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-search";
import { pedirInteresse } from "./vitrine-lead-capture";
import { normalizarTexto } from "@/lib/geo";
import type { Property } from "@/types/domain";

type Ordem = "recentes" | "menor" | "maior";

const TODOS = "";

function preco(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function VitrineImoveis({ imoveis }: { imoveis: Property[] }) {
  const [bairro, setBairro] = useState(TODOS);
  const [ordem, setOrdem] = useState<Ordem>("recentes");

  const bairros = useMemo(() => {
    const porChave = new Map<string, string>();
    for (const imovel of imoveis) {
      const nome = imovel.addressNeighborhood.trim();
      if (nome && !porChave.has(normalizarTexto(nome)))
        porChave.set(normalizarTexto(nome), nome);
    }
    return [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [imoveis]);

  const visiveis = useMemo(() => {
    const lista = imoveis.filter(
      (imovel) =>
        bairro === TODOS ||
        normalizarTexto(imovel.addressNeighborhood) === normalizarTexto(bairro),
    );
    if (ordem === "menor") return [...lista].sort((a, b) => a.price - b.price);
    if (ordem === "maior") return [...lista].sort((a, b) => b.price - a.price);
    return [...lista].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [imoveis, bairro, ordem]);

  if (imoveis.length === 0)
    return (
      <p className="vitrine-vazio">
        Nenhum imóvel publicado no momento. Conte o que você procura logo abaixo
        e avisamos quando surgir uma opção.
      </p>
    );

  return (
    <div className="vitrine-imoveis">
      <div className="vitrine-ferramentas">
        <div
          className="vitrine-chips"
          role="group"
          aria-label="Filtrar por bairro"
        >
          {[TODOS, ...bairros].map((nome) => (
            <button
              key={nome || "todos"}
              type="button"
              className="vitrine-chip"
              aria-pressed={bairro === nome}
              onClick={() => setBairro(nome)}
            >
              {nome || "Todos os bairros"}
            </button>
          ))}
        </div>
        <label className="vitrine-ordem">
          <span>Ordenar</span>
          <select
            value={ordem}
            onChange={(event) => setOrdem(event.target.value as Ordem)}
          >
            <option value="recentes">Mais recentes</option>
            <option value="menor">Menor preço</option>
            <option value="maior">Maior preço</option>
          </select>
        </label>
      </div>

      <ul className="vitrine-grade" aria-label="Imóveis à venda">
        {visiveis.map((imovel) => {
          const detalhes = [
            imovel.bedrooms > 0 && {
              icone: Bed,
              texto: `${imovel.bedrooms} ${imovel.bedrooms === 1 ? "quarto" : "quartos"}`,
            },
            imovel.bathrooms > 0 && {
              icone: Bathroom,
              texto: `${imovel.bathrooms} ${imovel.bathrooms === 1 ? "banheiro" : "banheiros"}`,
            },
            imovel.parkingSpots > 0 && {
              icone: Car,
              texto: `${imovel.parkingSpots} ${imovel.parkingSpots === 1 ? "vaga" : "vagas"}`,
            },
            (imovel.areaBuilt || imovel.areaTotal) > 0 && {
              icone: Expand,
              texto: `${imovel.areaBuilt || imovel.areaTotal} m²`,
            },
          ].filter(Boolean) as { icone: typeof Bed; texto: string }[];

          return (
            <li key={imovel.id} id={imovel.code} className="vitrine-card">
              <div className="vitrine-card-foto">
                {imovel.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imovel.images[0]} alt="" loading="lazy" />
                ) : null}
                <span className="vitrine-card-tipo">
                  {PROPERTY_TYPE_LABELS[imovel.type]}
                </span>
                {imovel.status === "RESERVED" && (
                  <span className="vitrine-card-reservado">Reservado</span>
                )}
              </div>
              <div className="vitrine-card-corpo">
                <p className="vitrine-card-preco">{preco(imovel.price)}</p>
                <h3>{imovel.title}</h3>
                <p className="vitrine-card-local">
                  <MapPin aria-hidden="true" width={14} height={14} />
                  {[imovel.addressNeighborhood, imovel.addressCity]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {detalhes.length > 0 && (
                  <ul className="vitrine-card-detalhes">
                    {detalhes.map(({ icone: Icone, texto }) => (
                      <li key={texto}>
                        <Icone aria-hidden="true" width={15} height={15} />
                        {texto}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="vitrine-card-rodape">
                <span className="vitrine-card-codigo">Cód. {imovel.code}</span>
                <a
                  className="vitrine-card-acao"
                  href="#busca"
                  onClick={() => pedirInteresse(imovel)}
                  aria-label={`Tenho interesse em ${imovel.title}`}
                >
                  <ChatBubble aria-hidden="true" width={15} height={15} />
                  Tenho interesse
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

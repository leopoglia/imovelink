"use client";

import React from "react";
import { Xmark } from "iconoir-react";
import { Select, PROPERTY_STATUS_OPTIONS } from "@/components/ui/select";
import {
  formatarMilhar,
  somenteDigitos,
} from "@/components/property-form-dialog";
import {
  FILTROS_PADRAO,
  FiltrosDeImoveis,
  TODOS,
} from "@/lib/property-filters";

const TODOS_OPCAO = { value: TODOS, label: "Todos" };

const ORIGENS = [
  { value: TODOS, label: "Todas" },
  { value: "CARTEIRA", label: "Minha carteira" },
  { value: "EXTERNOS", label: "Outros sites" },
];

const TIPOS = [
  TODOS_OPCAO,
  { value: "HOUSE", label: "Casa / Sobrado" },
  { value: "APARTMENT", label: "Apartamento" },
  { value: "PENTHOUSE", label: "Cobertura" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "LAND", label: "Terreno" },
];

const QUARTOS = [
  { value: "0", label: "Qualquer" },
  { value: "1", label: "1+" },
  { value: "2", label: "2+" },
  { value: "3", label: "3+" },
  { value: "4", label: "4+" },
];

interface PropertyFiltersDialogProps {
  filtros: FiltrosDeImoveis;
  bairros: string[];
  /** Quantos imóveis os filtros atuais mostram, para o botão de fechar. */
  resultado: number;
  onChange: (filtros: FiltrosDeImoveis) => void;
  onClose: () => void;
}

export function PropertyFiltersDialog({
  filtros,
  bairros,
  resultado,
  onChange,
  onClose,
}: PropertyFiltersDialogProps) {
  const alterar = (campo: keyof FiltrosDeImoveis, valor: string) =>
    onChange({ ...filtros, [campo]: valor });

  return (
    <div
      className="filters-overlay"
      // Clicar fora da caixa fecha, como nos outros modais.
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-filtros"
        className="filters-dialog"
        onKeyDown={(evento) => {
          if (evento.key === "Escape") onClose();
        }}
      >
        <header className="filters-dialog-header">
          <h2 id="titulo-filtros">Filtros</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar filtros"
            className="icon-button"
          >
            <Xmark aria-hidden="true" className="w-5 h-5" />
          </button>
        </header>

        <div className="filters-dialog-body">
          <div className="filters-span">
            <label className="field-label" htmlFor="filtro-texto">
              Buscar
            </label>
            <input
              id="filtro-texto"
              type="search"
              placeholder="Título, código, rua ou bairro"
              value={filtros.texto}
              onChange={(e) => alterar("texto", e.target.value)}
              className="field-control"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label" htmlFor="filtro-origem">
              Origem
            </label>
            <Select
              id="filtro-origem"
              value={filtros.origem}
              onValueChange={(valor) => alterar("origem", valor)}
              options={ORIGENS}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="filtro-bairro">
              Bairro
            </label>
            <Select
              id="filtro-bairro"
              value={filtros.bairro}
              onValueChange={(valor) => alterar("bairro", valor)}
              options={[
                TODOS_OPCAO,
                ...bairros.map((bairro) => ({ value: bairro, label: bairro })),
              ]}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="filtro-tipo">
              Tipo
            </label>
            <Select
              id="filtro-tipo"
              value={filtros.tipo}
              onValueChange={(valor) => alterar("tipo", valor)}
              options={TIPOS}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="filtro-status">
              Status
            </label>
            <Select
              id="filtro-status"
              value={filtros.status}
              onValueChange={(valor) => alterar("status", valor)}
              options={[TODOS_OPCAO, ...PROPERTY_STATUS_OPTIONS]}
            />
          </div>

          <div className="filters-span">
            <span className="field-label" id="rotulo-quartos">
              Quartos
            </span>
            <div
              className="filters-chips"
              role="radiogroup"
              aria-labelledby="rotulo-quartos"
            >
              {QUARTOS.map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  role="radio"
                  aria-checked={filtros.quartosMin === opcao.value}
                  className="filters-chip"
                  onClick={() => alterar("quartosMin", opcao.value)}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="filtro-preco-min">
              Valor mínimo
            </label>
            <div className="field-prefixed">
              <span aria-hidden="true">R$</span>
              <input
                id="filtro-preco-min"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={formatarMilhar(filtros.precoMin)}
                onChange={(e) =>
                  alterar("precoMin", somenteDigitos(e.target.value))
                }
                className="field-control"
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="filtro-preco-max">
              Valor máximo
            </label>
            <div className="field-prefixed">
              <span aria-hidden="true">R$</span>
              <input
                id="filtro-preco-max"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Sem limite"
                value={formatarMilhar(filtros.precoMax)}
                onChange={(e) =>
                  alterar("precoMax", somenteDigitos(e.target.value))
                }
                className="field-control"
              />
            </div>
          </div>

          <p className="filters-span filters-note">
            Tipo e status valem só para a sua carteira.
          </p>
        </div>

        <footer className="filters-dialog-footer">
          <button
            type="button"
            className="button-secondary"
            onClick={() => onChange(FILTROS_PADRAO)}
          >
            Limpar
          </button>
          <button type="button" className="button-primary" onClick={onClose}>
            {resultado === 1 ? "Ver 1 imóvel" : `Ver ${resultado} imóveis`}
          </button>
        </footer>
      </div>
    </div>
  );
}

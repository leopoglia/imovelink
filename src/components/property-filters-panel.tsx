"use client";

import React from "react";
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
  { value: TODOS, label: "Carteira e outros sites" },
  { value: "CARTEIRA", label: "Só a minha carteira" },
  { value: "EXTERNOS", label: "Só de outros sites" },
];

const TIPOS = [
  TODOS_OPCAO,
  { value: "HOUSE", label: "Casa / Sobrado" },
  { value: "APARTMENT", label: "Apartamento / Studio" },
  { value: "PENTHOUSE", label: "Cobertura" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "LAND", label: "Terreno" },
];

const QUARTOS = [
  { value: "0", label: "Qualquer" },
  { value: "1", label: "1 ou mais" },
  { value: "2", label: "2 ou mais" },
  { value: "3", label: "3 ou mais" },
  { value: "4", label: "4 ou mais" },
];

interface PropertyFiltersPanelProps {
  filtros: FiltrosDeImoveis;
  bairros: string[];
  onChange: (filtros: FiltrosDeImoveis) => void;
}

export function PropertyFiltersPanel({
  filtros,
  bairros,
  onChange,
}: PropertyFiltersPanelProps) {
  const alterar = (campo: keyof FiltrosDeImoveis, valor: string) =>
    onChange({ ...filtros, [campo]: valor });

  return (
    <section className="property-filters" aria-label="Filtros de imóveis">
      <div className="property-filters-search">
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
        <label className="field-label" htmlFor="filtro-quartos">
          Quartos
        </label>
        <Select
          id="filtro-quartos"
          value={filtros.quartosMin}
          onValueChange={(valor) => alterar("quartosMin", valor)}
          options={QUARTOS}
        />
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
            onChange={(e) => alterar("precoMin", somenteDigitos(e.target.value))}
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
            onChange={(e) => alterar("precoMax", somenteDigitos(e.target.value))}
            className="field-control"
          />
        </div>
      </div>

      <p className="property-filters-note">
        Anúncios de outros sites não têm tipo nem status: ao filtrar por um
        deles, só a sua carteira aparece.
      </p>

      <div className="property-filters-actions">
        <button
          type="button"
          className="button-secondary button-compact"
          onClick={() => onChange(FILTROS_PADRAO)}
        >
          Limpar filtros
        </button>
      </div>
    </section>
  );
}

"use client";

import React, { useState } from "react";
import { Xmark } from "iconoir-react";
import { apiFetch } from "@/lib/api";
import { Select } from "@/components/ui/select";
import { Property, PropertyType } from "@/types/domain";

const TIPOS = [
  { value: "HOUSE", label: "Casa / Sobrado" },
  { value: "APARTMENT", label: "Apartamento / Studio" },
  { value: "PENTHOUSE", label: "Cobertura Duplex" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "LAND", label: "Terreno" },
];

/** Mantém só os dígitos, sem zeros à esquerda: "R$ 01.500" vira "1500". */
export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 11);
}

/** "450000" vira "450.000". */
export function formatarMilhar(digitos: string): string {
  return digitos ? Number(digitos).toLocaleString("pt-BR") : "";
}

function linkDeImagemValido(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const VAZIO = {
  title: "",
  type: "HOUSE" as PropertyType,
  price: "",
  neighborhood: "",
  street: "",
  bedrooms: "0",
  suites: "0",
  bathrooms: "0",
  parkingSpots: "0",
  areaBuilt: "0",
  areaTotal: "0",
  imageUrl: "",
  description: "",
};

type Campos = typeof VAZIO;

/** Devolve a primeira pendência do formulário, ou null se ele pode ser enviado. */
export function validarImovel(campos: Campos): string | null {
  if (campos.title.trim().length < 3)
    return "Informe o título do imóvel (pelo menos 3 letras).";
  if (!campos.price) return "Informe o valor de venda.";
  if (!campos.neighborhood.trim()) return "Informe o bairro.";
  if (!campos.street.trim()) return "Informe a rua e o número.";
  if (campos.imageUrl.trim() && !linkDeImagemValido(campos.imageUrl.trim()))
    return "O link da foto precisa começar com https://.";
  if (campos.description.trim().length < 3)
    return "Escreva uma descrição do imóvel.";
  return null;
}

interface PropertyCreateDialogProps {
  bairros: string[];
  onClose: () => void;
  onCreated: (property: Property) => void;
}

export function PropertyCreateDialog({
  bairros,
  onClose,
  onCreated,
}: PropertyCreateDialogProps) {
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fotoQuebrada, setFotoQuebrada] = useState(false);

  const alterar = (campo: keyof Campos, valor: string) =>
    setCampos((atual) => ({ ...atual, [campo]: valor }));

  const numero = (campo: keyof Campos) => ({
    type: "number",
    min: 0,
    inputMode: "numeric" as const,
    value: campos[campo],
    onChange: (evento: React.ChangeEvent<HTMLInputElement>) =>
      alterar(campo, evento.target.value),
    className: "field-control",
  });

  const fotoValida =
    campos.imageUrl.trim() !== "" && linkDeImagemValido(campos.imageUrl.trim());

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    const pendencia = validarImovel(campos);
    if (pendencia) {
      setErro(pendencia);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await apiFetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: campos.title.trim(),
          description: campos.description.trim(),
          type: campos.type,
          purpose: "SALE",
          price: Number(campos.price),
          bedrooms: Number(campos.bedrooms) || 0,
          suites: Number(campos.suites) || 0,
          bathrooms: Number(campos.bathrooms) || 0,
          parkingSpots: Number(campos.parkingSpots) || 0,
          areaBuilt: Number(campos.areaBuilt) || 0,
          areaTotal: Number(campos.areaTotal) || 0,
          addressStreet: campos.street.trim(),
          addressNeighborhood: campos.neighborhood.trim(),
          images: fotoValida ? [campos.imageUrl.trim()] : [],
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok)
        throw new Error(dados.error || "Não foi possível cadastrar o imóvel.");
      onCreated(dados.property);
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível cadastrar o imóvel.",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-novo-imovel"
        noValidate
        onSubmit={(evento) => void salvar(evento)}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") onClose();
        }}
        className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2
            id="titulo-novo-imovel"
            className="text-base font-semibold text-slate-900"
          >
            Cadastrar novo imóvel
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar cadastro de imóvel"
            className="icon-button"
          >
            <Xmark aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="imovel-titulo">
              Título do imóvel *
            </label>
            <input
              id="imovel-titulo"
              type="text"
              value={campos.title}
              onChange={(e) => alterar("title", e.target.value)}
              placeholder="Ex: Casa com quintal arborizado na Vila Nova"
              className="field-control"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label" htmlFor="imovel-tipo">
              Tipo
            </label>
            <Select
              id="imovel-tipo"
              value={campos.type}
              onValueChange={(valor) => alterar("type", valor)}
              options={TIPOS}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="imovel-preco">
              Valor de venda *
            </label>
            <div className="field-prefixed">
              <span aria-hidden="true">R$</span>
              <input
                id="imovel-preco"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="450.000"
                value={formatarMilhar(campos.price)}
                onChange={(e) =>
                  alterar("price", somenteDigitos(e.target.value))
                }
                className="field-control"
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="imovel-bairro">
              Bairro *
            </label>
            <input
              id="imovel-bairro"
              type="text"
              list="imovel-bairros"
              autoComplete="off"
              placeholder="Digite ou escolha"
              value={campos.neighborhood}
              onChange={(e) => alterar("neighborhood", e.target.value)}
              className="field-control"
            />
            <datalist id="imovel-bairros">
              {bairros.map((bairro) => (
                <option key={bairro} value={bairro} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="field-label" htmlFor="imovel-rua">
              Rua e número *
            </label>
            <input
              id="imovel-rua"
              type="text"
              value={campos.street}
              onChange={(e) => alterar("street", e.target.value)}
              placeholder="Ex: Rua Marechal Deodoro, 450"
              className="field-control"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:col-span-2">
            <div>
              <label className="field-label" htmlFor="imovel-quartos">
                Quartos
              </label>
              <input id="imovel-quartos" {...numero("bedrooms")} />
            </div>
            <div>
              <label className="field-label" htmlFor="imovel-suites">
                Suítes
              </label>
              <input id="imovel-suites" {...numero("suites")} />
            </div>
            <div>
              <label className="field-label" htmlFor="imovel-banheiros">
                Banheiros
              </label>
              <input id="imovel-banheiros" {...numero("bathrooms")} />
            </div>
            <div>
              <label className="field-label" htmlFor="imovel-vagas">
                Vagas
              </label>
              <input id="imovel-vagas" {...numero("parkingSpots")} />
            </div>
            <div>
              <label className="field-label" htmlFor="imovel-area-construida">
                Área construída (m²)
              </label>
              <input id="imovel-area-construida" {...numero("areaBuilt")} />
            </div>
            <div>
              <label className="field-label" htmlFor="imovel-area-total">
                Área total (m²)
              </label>
              <input id="imovel-area-total" {...numero("areaTotal")} />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="imovel-foto">
              Link da foto
            </label>
            <input
              id="imovel-foto"
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={campos.imageUrl}
              onChange={(e) => {
                setFotoQuebrada(false);
                alterar("imageUrl", e.target.value);
              }}
              aria-describedby="imovel-foto-dica"
              className="field-control"
            />
            <p id="imovel-foto-dica" className="field-hint">
              Cole o endereço de uma imagem já publicada. Sem foto, o imóvel
              recebe uma imagem padrão do tipo escolhido.
            </p>
            {fotoValida && (
              <div className="property-photo-preview">
                {fotoQuebrada ? (
                  <p role="status">
                    Não foi possível carregar essa imagem. Confira o link.
                  </p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={campos.imageUrl.trim()}
                    alt="Prévia da foto do imóvel"
                    onError={() => setFotoQuebrada(true)}
                  />
                )}
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="imovel-descricao">
              Descrição *
            </label>
            <textarea
              id="imovel-descricao"
              rows={3}
              value={campos.description}
              onChange={(e) => alterar("description", e.target.value)}
              className="field-control"
            />
          </div>
        </div>

        {erro && (
          <p className="form-alert" role="alert">
            {erro}
          </p>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button type="button" onClick={onClose} className="button-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="button-primary">
            {salvando ? "Salvando..." : "Salvar imóvel"}
          </button>
        </div>
      </form>
    </div>
  );
}

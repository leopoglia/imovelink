"use client";

import React, { useState } from "react";
import { Xmark } from "iconoir-react";
import { apiFetch } from "@/lib/api";
import { Select } from "@/components/ui/select";
import { normalizarTexto } from "@/lib/geo";
import { ExternalListing, Property, PropertyType } from "@/types/domain";

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

export const CAMPOS_VAZIOS = {
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

export type CamposDoImovel = typeof CAMPOS_VAZIOS;

const inteiro = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? "0" : String(Math.round(valor));

/** Preenche o formulário com um imóvel da carteira, para edição. */
export function camposDoImovel(imovel: Property): CamposDoImovel {
  return {
    title: imovel.title,
    type: imovel.type,
    price: somenteDigitos(inteiro(imovel.price)),
    neighborhood: imovel.addressNeighborhood,
    street: imovel.addressStreet,
    bedrooms: inteiro(imovel.bedrooms),
    suites: inteiro(imovel.suites),
    bathrooms: inteiro(imovel.bathrooms),
    parkingSpots: inteiro(imovel.parkingSpots),
    areaBuilt: inteiro(imovel.areaBuilt),
    areaTotal: inteiro(imovel.areaTotal),
    imageUrl: imovel.images[0] ?? "",
    description: imovel.description,
  };
}

/** Deduz o tipo pelo título do anúncio, que é onde os sites costumam dizê-lo. */
export function tipoPeloTitulo(titulo: string): PropertyType {
  const texto = normalizarTexto(titulo);
  const palavras = new Set(texto.split(/[^a-z0-9]+/));
  const tem = (lista: string[]) => lista.some((item) => palavras.has(item));
  if (tem(["cobertura"])) return "PENTHOUSE";
  if (tem(["apartamento", "apto", "studio", "kitnet", "loft"]))
    return "APARTMENT";
  // "Casa com sala ampla" é casa: o tipo residencial vem antes de "sala".
  if (tem(["casa", "sobrado", "geminado", "chacara"])) return "HOUSE";
  if (tem(["terreno", "lote"])) return "LAND";
  if (tem(["sala", "loja", "galpao", "comercial"])) return "COMMERCIAL";
  return "HOUSE";
}

const NOMES_DO_TIPO: Record<PropertyType, string> = {
  HOUSE: "Casa",
  APARTMENT: "Apartamento",
  PENTHOUSE: "Cobertura",
  COMMERCIAL: "Imóvel comercial",
  LAND: "Terreno",
};

const plural = (quantidade: number, singular: string, varios: string) =>
  `${quantidade} ${quantidade === 1 ? singular : varios}`;

/** Junta itens como "a, b e c". */
function listar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * Escreve uma descrição a partir dos dados do formulário. Só entra o que foi
 * informado: zero quartos ou área vazia não aparecem no texto.
 */
export function gerarDescricao(campos: CamposDoImovel): string {
  const numero = (valor: string) => Number(valor) || 0;
  const quartos = numero(campos.bedrooms);
  const suites = numero(campos.suites);
  const banheiros = numero(campos.bathrooms);
  const vagas = numero(campos.parkingSpots);
  const construida = numero(campos.areaBuilt);
  const total = numero(campos.areaTotal);
  const bairro = campos.neighborhood.trim();

  let abertura = `${NOMES_DO_TIPO[campos.type]} à venda`;
  if (bairro) abertura += ` no bairro ${bairro}`;
  abertura += ", em Jaraguá do Sul";

  const itens: string[] = [];
  if (quartos)
    itens.push(
      plural(quartos, "quarto", "quartos") +
        (suites ? ` (${plural(suites, "suíte", "suítes")})` : ""),
    );
  else if (suites) itens.push(plural(suites, "suíte", "suítes"));
  if (banheiros) itens.push(plural(banheiros, "banheiro", "banheiros"));
  if (vagas) itens.push(plural(vagas, "vaga de garagem", "vagas de garagem"));

  const frases = [itens.length ? `${abertura}, com ${listar(itens)}.` : `${abertura}.`];

  const areas: string[] = [];
  if (construida) areas.push(`${construida.toLocaleString("pt-BR")} m² de área construída`);
  if (total) areas.push(`${total.toLocaleString("pt-BR")} m² de área total`);
  if (areas.length) frases.push(`São ${listar(areas)}.`);

  if (campos.price) frases.push(`Valor: R$ ${formatarMilhar(campos.price)}.`);
  return frases.join(" ");
}

/**
 * Preenche o cadastro com um anúncio de outro site: dados, foto (pelo
 * endereço da origem) e uma descrição gerada a partir desses dados.
 */
export function camposDoAnuncio(anuncio: ExternalListing): CamposDoImovel {
  const campos: CamposDoImovel = {
    ...CAMPOS_VAZIOS,
    title: anuncio.title,
    type: tipoPeloTitulo(anuncio.title),
    price: anuncio.price === null ? "" : somenteDigitos(inteiro(anuncio.price)),
    neighborhood: anuncio.neighborhood ?? "",
    bedrooms: inteiro(anuncio.bedrooms),
    parkingSpots: inteiro(anuncio.parkingSpots),
    areaTotal: inteiro(anuncio.areaTotal),
    imageUrl: anuncio.imageUrl ?? "",
  };
  return { ...campos, description: gerarDescricao(campos) };
}

/** Devolve a primeira pendência do formulário, ou null se ele pode ser enviado. */
export function validarImovel(campos: CamposDoImovel): string | null {
  if (campos.title.trim().length < 3)
    return "Informe o título do imóvel (pelo menos 3 letras).";
  if (!campos.price) return "Informe o valor de venda.";
  if (!campos.neighborhood.trim()) return "Informe o bairro.";
  if (campos.imageUrl.trim() && !linkDeImagemValido(campos.imageUrl.trim()))
    return "O link da foto precisa começar com https://.";
  if (campos.description.trim().length < 3)
    return "Escreva uma descrição do imóvel.";
  return null;
}

/** Converte o formulário nos campos que a API de imóveis recebe. */
function paraApi(campos: CamposDoImovel) {
  const foto = campos.imageUrl.trim();
  return {
    title: campos.title.trim(),
    description: campos.description.trim(),
    type: campos.type,
    price: Number(campos.price),
    bedrooms: Number(campos.bedrooms) || 0,
    suites: Number(campos.suites) || 0,
    bathrooms: Number(campos.bathrooms) || 0,
    parkingSpots: Number(campos.parkingSpots) || 0,
    areaBuilt: Number(campos.areaBuilt) || 0,
    areaTotal: Number(campos.areaTotal) || 0,
    addressStreet: campos.street.trim(),
    addressNeighborhood: campos.neighborhood.trim(),
    images: foto && linkDeImagemValido(foto) ? [foto] : [],
  };
}

/**
 * Só o que mudou em relação ao imóvel salvo. A foto nova entra no lugar da
 * primeira; apagar o link não remove a foto atual.
 */
export function alteracoesDoImovel(
  imovel: Property,
  campos: CamposDoImovel,
): Record<string, unknown> {
  const antes = paraApi(camposDoImovel(imovel));
  const depois = paraApi(campos);
  const mudancas: Record<string, unknown> = {};
  for (const chave of Object.keys(depois) as (keyof typeof depois)[]) {
    if (chave === "images") continue;
    if (depois[chave] !== antes[chave]) mudancas[chave] = depois[chave];
  }
  const foto = depois.images[0];
  if (foto && foto !== imovel.images[0])
    mudancas.images = [foto, ...imovel.images.slice(1)];
  return mudancas;
}

export type ModoDoFormulario =
  | { tipo: "novo" }
  | { tipo: "editar"; imovel: Property }
  | { tipo: "importar"; anuncio: ExternalListing; fonte?: string };

const TITULOS = {
  novo: "Cadastrar novo imóvel",
  editar: "Editar imóvel",
  importar: "Trazer para a minha carteira",
};

function camposIniciais(modo: ModoDoFormulario): CamposDoImovel {
  if (modo.tipo === "editar") return camposDoImovel(modo.imovel);
  if (modo.tipo === "importar") return camposDoAnuncio(modo.anuncio);
  return CAMPOS_VAZIOS;
}

interface PropertyFormDialogProps {
  modo: ModoDoFormulario;
  bairros: string[];
  onClose: () => void;
  onSaved: (property: Property) => void;
}

export function PropertyFormDialog({
  modo,
  bairros,
  onClose,
  onSaved,
}: PropertyFormDialogProps) {
  const [campos, setCampos] = useState<CamposDoImovel>(() =>
    camposIniciais(modo),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fotoQuebrada, setFotoQuebrada] = useState(false);

  const alterar = (campo: keyof CamposDoImovel, valor: string) =>
    setCampos((atual) => ({ ...atual, [campo]: valor }));

  const numero = (campo: keyof CamposDoImovel) => ({
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

  async function enviar(): Promise<Property | null> {
    if (modo.tipo === "editar") {
      const updates = alteracoesDoImovel(modo.imovel, campos);
      // Nada mudou: fecha sem chamar o servidor.
      if (Object.keys(updates).length === 0) return modo.imovel;
      const resposta = await apiFetch(`/api/properties/${modo.imovel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok)
        throw new Error(dados.error || "Não foi possível alterar o imóvel.");
      return dados.property;
    }
    const resposta = await apiFetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...paraApi(campos),
        purpose: "SALE",
        ...(modo.tipo === "importar"
          ? { sourceListingUrl: modo.anuncio.url }
          : {}),
      }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok)
      throw new Error(dados.error || "Não foi possível cadastrar o imóvel.");
    return dados.property;
  }

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
      const salvo = await enviar();
      if (salvo) onSaved(salvo);
    } catch (causa) {
      setErro(
        causa instanceof Error ? causa.message : "Não foi possível salvar o imóvel.",
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
        aria-labelledby="titulo-formulario-imovel"
        noValidate
        onSubmit={(evento) => void salvar(evento)}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") onClose();
        }}
        className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2
            id="titulo-formulario-imovel"
            className="text-base font-semibold text-slate-900"
          >
            {TITULOS[modo.tipo]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar formulário do imóvel"
            className="icon-button"
          >
            <Xmark aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {modo.tipo === "importar" && (
          <p className="field-hint">
            Trouxemos os dados e a foto do anúncio
            {modo.fonte ? ` em ${modo.fonte}` : ""} e escrevemos uma descrição
            com eles. Confira antes de salvar.{" "}
            <a href={modo.anuncio.url} target="_blank" rel="noopener noreferrer nofollow">
              Ver anúncio de origem
            </a>
          </p>
        )}

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
              Rua e número
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
              className="field-control"
            />
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

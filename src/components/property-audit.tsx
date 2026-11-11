"use client";

import React, { useState } from "react";
import { ArrowRight, Search } from "iconoir-react";
import {
  AUDIT_ACTION_LABELS,
  formatAuditDate,
  getAuditChanges,
} from "@/lib/property-audit";
import type { AuditAction, PropertyAuditLog } from "@/types/domain";
import { Select } from "@/components/ui/select";

interface PropertyAuditProps {
  logs: PropertyAuditLog[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry: () => void;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

export function PropertyAudit({
  logs,
  isLoading,
  isError,
  onRetry,
}: PropertyAuditProps) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<AuditAction | "ALL">("ALL");
  const query = normalize(search.trim());
  const filteredLogs = logs
    .filter(
      (log) =>
        (action === "ALL" || log.action === action) &&
        normalize(
          `${log.propertyCode} ${log.propertyTitle} ${log.userName}`,
        ).includes(query),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  return (
    <section aria-label="Auditoria de imóveis" className="property-audit">
      <div className="audit-toolbar">
        <div className="relative audit-search">
          <Search
            width={17}
            height={17}
            className="field-icon"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Buscar na auditoria"
            placeholder="Buscar imóvel ou responsável"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="field-control field-control-search"
          />
        </div>
        <Select
          aria-label="Filtrar por alteração"
          className="audit-filter"
          value={action}
          onValueChange={(value) => setAction(value as AuditAction | "ALL")}
          options={[
            { value: "ALL", label: "Todas as alterações" },
            ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </div>

      {isLoading ? (
        <p className="audit-empty" role="status">
          Carregando histórico…
        </p>
      ) : isError ? (
        <div className="audit-empty" role="alert">
          <p>Não foi possível carregar o histórico.</p>
          <button
            type="button"
            className="button-secondary button-compact"
            onClick={onRetry}
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="audit-empty" role="status">
          <p>
            {logs.length === 0
              ? "Nenhuma alteração registrada."
              : "Nenhum registro encontrado."}
          </p>
          {logs.length > 0 && (
            <button
              type="button"
              className="button-secondary button-compact"
              onClick={() => {
                setSearch("");
                setAction("ALL");
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <table className="audit-table">
          <caption className="sr-only">
            Histórico de alterações dos imóveis, do mais recente ao mais antigo
          </caption>
          <thead>
            <tr>
              <th scope="col">Imóvel</th>
              <th scope="col">Alteração</th>
              <th scope="col">Responsável</th>
              <th scope="col">Data e hora</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => {
              const changes = getAuditChanges(log);
              const timestamp = formatAuditDate(log.createdAt);
              return (
                <tr key={log.id}>
                  <td className="audit-property">
                    <span className="audit-code">{log.propertyCode}</span>
                    <span className="audit-property-title">
                      {log.propertyTitle}
                    </span>
                  </td>
                  <td className="audit-event">
                    <span
                      className={`audit-action ${log.action === "DELETED" ? "audit-action-deleted" : ""}`}
                    >
                      {AUDIT_ACTION_LABELS[log.action]}
                    </span>
                    {changes.length ? (
                      <ul className="audit-changes">
                        {changes.map((change) => (
                          <li key={change.field}>
                            <span className="audit-change-label">
                              {change.label}
                            </span>
                            <span className="audit-change-values">
                              {change.before !== null && (
                                <span
                                  className={
                                    change.after !== null
                                      ? "audit-previous"
                                      : ""
                                  }
                                >
                                  {change.before}
                                </span>
                              )}
                              {change.before !== null &&
                                change.after !== null && (
                                  <>
                                    <ArrowRight
                                      width={13}
                                      height={13}
                                      aria-hidden="true"
                                    />
                                    <span className="sr-only">para</span>
                                  </>
                                )}
                              {change.after !== null && (
                                <span
                                  className={
                                    change.before !== null
                                      ? "audit-current"
                                      : ""
                                  }
                                >
                                  {change.after}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="audit-no-detail">
                        {log.action === "CREATED"
                          ? "Imóvel cadastrado."
                          : log.action === "DELETED"
                            ? "Imóvel excluído do estoque."
                            : "Atualização registrada sem detalhes dos campos."}
                      </p>
                    )}
                  </td>
                  <td className="audit-author">
                    <span className="sr-only">Responsável: </span>
                    {log.userName}
                  </td>
                  <td className="audit-date">
                    <time dateTime={log.createdAt}>
                      <span>{timestamp.date}</span>
                      <span>{timestamp.time}</span>
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

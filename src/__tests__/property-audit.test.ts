// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { PropertyAudit } from "@/components/property-audit";
import { formatAuditDate, getAuditChanges } from "@/lib/property-audit";
import type { PropertyAuditLog } from "@/types/domain";

const priceLog: PropertyAuditLog = {
  id: "audit-1",
  tenantId: "tenant-1",
  propertyId: "property-1",
  propertyCode: "IMV-101",
  propertyTitle: "Casa no Centro",
  userId: "user-1",
  userName: "João Silva",
  userRole: "AGENCY_ADMIN",
  action: "PRICE_UPDATED",
  summary: "Descrição técnica que não deve aparecer",
  beforeState: { price: 950000, status: "AVAILABLE", title: "Casa no Centro" },
  afterState: { price: 920000, status: "AVAILABLE", title: "Casa no Centro" },
  createdAt: "2026-11-09T02:30:00Z",
};
const statusLog: PropertyAuditLog = {
  ...priceLog,
  id: "audit-2",
  propertyCode: "IMV-102",
  propertyTitle: "Apartamento",
  userName: "Marina Becker",
  action: "STATUS_CHANGED",
  beforeState: { status: "AVAILABLE", price: 500000 },
  afterState: { status: "RESERVED", price: 500000 },
  createdAt: "2026-11-09T14:00:00Z",
};

afterEach(cleanup);
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Auditoria de imóveis", () => {
  it("mostra apenas os valores alterados e formata reais e status", () => {
    const changes = getAuditChanges(priceLog);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      field: "price",
      before: expect.stringContaining("950.000"),
      after: expect.stringContaining("920.000"),
    });
    expect(getAuditChanges(statusLog)).toEqual([
      {
        field: "status",
        label: "Status",
        before: "Disponível",
        after: "Reservado",
      },
    ]);
  });

  it("trata cadastro e exclusão sem inventar uma transição", () => {
    expect(
      getAuditChanges({
        ...priceLog,
        action: "CREATED",
        beforeState: null,
        afterState: { price: 0, status: "AVAILABLE" },
      }),
    ).toEqual([
      {
        field: "price",
        label: "Preço",
        before: null,
        after: expect.stringContaining("0"),
      },
      { field: "status", label: "Status", before: null, after: "Disponível" },
    ]);
    const removed = getAuditChanges({
      ...statusLog,
      action: "DELETED",
      afterState: null,
    });
    expect(removed).toHaveLength(2);
    expect(
      removed.every(
        (change) => change.before !== null && change.after === null,
      ),
    ).toBe(true);
  });

  it("não expõe campos técnicos e distingue valores ausentes", () => {
    expect(
      getAuditChanges({
        ...priceLog,
        beforeState: { id: "old-id", tenantId: "a" },
        afterState: { id: "new-id", tenantId: "b" },
      }),
    ).toEqual([]);
    expect(
      getAuditChanges({
        ...priceLog,
        beforeState: null,
        afterState: { price: 12.5 },
      })[0],
    ).toMatchObject({
      before: "Não registrado",
      after: expect.stringContaining("12,50"),
    });
  });

  it("usa o fuso de São Paulo inclusive na virada do dia", () => {
    expect(formatAuditDate(priceLog.createdAt)).toEqual({
      date: "08/11/2026",
      time: "23:30",
    });
    expect(formatAuditDate("invalid").date).toBe("Data não registrada");
  });

  it("ordena os registros e combina busca sem acentos com filtro de alteração", async () => {
    render(
      React.createElement(PropertyAudit, {
        logs: [priceLog, statusLog],
        onRetry: vi.fn(),
      }),
    );
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("IMV-102")).toBeTruthy();
    expect(screen.queryByText("PRICE_UPDATED")).toBeNull();
    expect(screen.queryByText(priceLog.summary)).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "joao" },
    });
    expect(screen.getByText("IMV-101")).toBeTruthy();
    expect(screen.queryByText("IMV-102")).toBeNull();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    const option = await screen.findByRole("option", {
      name: "Status alterado",
    });
    fireEvent.keyDown(option, { key: "Enter" });
    expect(screen.getByText("Nenhum registro encontrado.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("distingue carregamento, histórico vazio e erro com nova tentativa", () => {
    const retry = vi.fn();
    const view = render(
      React.createElement(PropertyAudit, {
        logs: [],
        isLoading: true,
        onRetry: retry,
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("Carregando");
    view.rerender(
      React.createElement(PropertyAudit, { logs: [], onRetry: retry }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Nenhuma alteração registrada.",
    );
    view.rerender(
      React.createElement(PropertyAudit, {
        logs: [],
        isError: true,
        onRetry: retry,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

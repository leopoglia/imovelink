// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Select, PROPERTY_STATUS_OPTIONS } from "@/components/ui/select";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function StatusForm({ onSubmit = vi.fn(), disabled = false }) {
  const [status, setStatus] = useState("AVAILABLE");
  return React.createElement(
    "form",
    {
      "aria-label": "Imóvel",
      onSubmit: (event: React.FormEvent) => {
        event.preventDefault();
        onSubmit();
      },
    },
    React.createElement(Select, {
      "aria-label": "Status do imóvel",
      name: "status",
      value: status,
      onValueChange: setStatus,
      options: PROPERTY_STATUS_OPTIONS,
      variant: "status",
      disabled,
    }),
    React.createElement("button", { type: "submit" }, "Salvar"),
  );
}

describe("Select do portal", () => {
  it("abre pelo teclado, permite selecionar e atualiza o valor do formulário sem enviá-lo", async () => {
    const submit = vi.fn();
    render(React.createElement(StatusForm, { onSubmit: submit }));
    const trigger = screen.getByRole("combobox", { name: "Status do imóvel" });
    expect(trigger.textContent).toBe("Disponível");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const option = await screen.findByRole("option", { name: "Reservado" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(
      screen
        .getByRole("option", { name: "Disponível" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(option, { key: "Enter" });
    await waitFor(() => expect(trigger.textContent).toBe("Reservado"));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(
      new FormData(screen.getByRole("form") as HTMLFormElement).get("status"),
    ).toBe("RESERVED");
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("fecha com Escape sem alterar o valor e devolve o foco", async () => {
    render(React.createElement(StatusForm));
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = await screen.findByRole("listbox");
    fireEvent.keyDown(list, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.textContent).toBe("Disponível");
  });

  it("respeita campos desabilitados", () => {
    render(React.createElement(StatusForm, { disabled: true }));
    const trigger = screen.getByRole("combobox") as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

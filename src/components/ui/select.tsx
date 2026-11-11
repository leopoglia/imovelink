"use client";

import React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, NavArrowDown, NavArrowUp } from "iconoir-react";

type SelectOption = {
  value: string;
  label: string;
  tone?: "blue" | "amber" | "slate" | "muted";
  disabled?: boolean;
};

interface SelectProps
  extends Pick<
    React.ComponentPropsWithoutRef<"button">,
    | "id"
    | "aria-label"
    | "aria-labelledby"
    | "aria-describedby"
    | "aria-invalid"
    | "className"
  > {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  variant?: "field" | "status";
  disabled?: boolean;
  required?: boolean;
  name?: string;
  autoComplete?: string;
}

export const PROPERTY_STATUS_OPTIONS = [
  { value: "AVAILABLE", label: "Disponível", tone: "blue" },
  { value: "RESERVED", label: "Reservado", tone: "amber" },
  { value: "SOLD", label: "Vendido", tone: "slate" },
  { value: "INACTIVE", label: "Inativo", tone: "muted" },
] as const satisfies readonly SelectOption[];

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Selecione",
  variant = "field",
  disabled,
  required,
  name,
  autoComplete,
  className = "",
  ...triggerProps
}: SelectProps) {
  const selected = options.find((option) => option.value === value);

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      required={required}
      name={name}
      autoComplete={autoComplete}
    >
      <SelectPrimitive.Trigger
        {...triggerProps}
        className={`field-control select-trigger ${variant === "status" ? "select-trigger-status" : ""} ${className}`}
      >
        <span className="select-trigger-value">
          {selected?.tone && (
            <span
              aria-hidden="true"
              className="select-dot"
              data-tone={selected.tone}
            />
          )}
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon className="select-chevron">
          <NavArrowDown width={15} height={15} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="select-menu"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <NavArrowUp width={15} height={15} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                textValue={option.label}
                className="select-option"
              >
                {option.tone && (
                  <span
                    aria-hidden="true"
                    className="select-dot"
                    data-tone={option.tone}
                  />
                )}
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="select-check">
                  <Check width={16} height={16} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <NavArrowDown width={15} height={15} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

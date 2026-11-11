"use client";

import React from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings } from "iconoir-react";
import type { UserProfile } from "@/types/domain";

interface AccountMenuProps {
  user: Pick<UserProfile, "name" | "email">;
  onLogout: () => void;
  disabled?: boolean;
}

export function AccountMenu({ user, onLogout, disabled }: AccountMenuProps) {
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="avatar profile-avatar"
          aria-label="Abrir menu da conta"
          title={user.name}
        >
          {initials}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="account-menu"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          aria-label="Minha conta"
          aria-labelledby={undefined}
        >
          <DropdownMenu.Label className="account-menu-identity">
            <strong title={user.name}>{user.name}</strong>
            <span title={user.email}>{user.email}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="account-menu-separator" />
          <DropdownMenu.Item asChild className="account-menu-item">
            <Link href="/configuracoes">
              <Settings width={17} height={17} aria-hidden="true" />
              Configurações
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="account-menu-separator" />
          <DropdownMenu.Item
            className="account-menu-item account-menu-logout"
            disabled={disabled}
            onSelect={onLogout}
          >
            <LogOut width={17} height={17} aria-hidden="true" />
            Sair da conta
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

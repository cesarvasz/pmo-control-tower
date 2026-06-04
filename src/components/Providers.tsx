"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { PermissionsProvider } from "@/context/PermissionsContext";
import { GroupsProvider } from "@/context/GroupsContext";
import { DataProvider } from "@/context/DataContext";

// Envoltura de todos los providers globales del cliente.
// Permissions, Groups y Data van DENTRO de AuthProvider porque dependen de la sesión.
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <PermissionsProvider>
        <GroupsProvider>
          <DataProvider>{children}</DataProvider>
        </GroupsProvider>
      </PermissionsProvider>
    </AuthProvider>
  );
}

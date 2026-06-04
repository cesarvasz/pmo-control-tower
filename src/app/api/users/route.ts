// src/app/api/users/route.ts
// Lista todos los usuarios. Solo para admins (manageUsers).

import { NextResponse } from "next/server";
import { listUsers, requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_users");
    const users = await listUsers();
    return NextResponse.json(users);
  } catch (err) {
    return apiError(err);
  }
}

// src/app/api/analytics/data/route.ts
// Devuelve datos de visitas. Solo para usuarios con manage_users.

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export interface PageView {
  id: string;
  userId: string;
  userEmail: string;
  page: string;
  pageLabel: string;
  sessionId: string;
  timestamp: string;
}

export interface AnalyticsData {
  views: PageView[];
  byPage: { page: string; label: string; count: number; uniqueUsers: number }[];
  byUser: { email: string; count: number; lastSeen: string }[];
  total: number;
}

export async function GET(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_users");

    const db = getAdminDb();
    const snap = await db
      .collection("page_views")
      .orderBy("timestamp", "desc")
      .limit(500)
      .get();

    const views: PageView[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        userId: d.userId ?? "",
        userEmail: d.userEmail ?? "",
        page: d.page ?? "/",
        pageLabel: d.pageLabel ?? d.page ?? "/",
        sessionId: d.sessionId ?? "",
        timestamp: d.timestamp?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      };
    });

    // aggregate by page
    const pageMap = new Map<string, { label: string; count: number; users: Set<string> }>();
    const userMap = new Map<string, { count: number; lastSeen: string }>();

    for (const v of views) {
      if (!pageMap.has(v.page)) pageMap.set(v.page, { label: v.pageLabel, count: 0, users: new Set() });
      const p = pageMap.get(v.page)!;
      p.count++;
      p.users.add(v.userId);

      if (!userMap.has(v.userEmail)) userMap.set(v.userEmail, { count: 0, lastSeen: v.timestamp });
      const u = userMap.get(v.userEmail)!;
      u.count++;
      if (v.timestamp > u.lastSeen) u.lastSeen = v.timestamp;
    }

    const byPage = [...pageMap.entries()]
      .map(([page, d]) => ({ page, label: d.label, count: d.count, uniqueUsers: d.users.size }))
      .sort((a, b) => b.count - a.count);

    const byUser = [...userMap.entries()]
      .map(([email, d]) => ({ email, count: d.count, lastSeen: d.lastSeen }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ views, byPage, byUser, total: views.length } satisfies AnalyticsData);
  } catch (err) {
    return apiError(err);
  }
}

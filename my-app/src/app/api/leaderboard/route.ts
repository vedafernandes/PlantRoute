import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leaderboard
 * Returns users ranked by average CO2 per trip (kg), ascending.
 * Lower average = higher rank (better).
 */
export async function GET() {
  try {
    if (typeof prisma.tripCarbon?.groupBy !== "function") {
      console.warn("[leaderboard] prisma.tripCarbon not available. Run: npx prisma generate");
      return NextResponse.json({ leaderboard: [] });
    }
    const rows = await prisma.tripCarbon.groupBy({
      by: ["userId"],
      _avg: { emissionKg: true },
      _count: { id: true },
    });

    const validRows = rows.filter((r) => r.userId != null && r.userId !== "");
    if (validRows.length === 0) {
      return NextResponse.json({ leaderboard: [] });
    }

    const userIds = validRows.map((r) => r.userId as string);
    let userMap = new Map<string, { id: string; name: string | null; image: string | null }>();
    try {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, image: true },
      });
      userMap = new Map(users.map((u) => [u.id, u]));
    } catch (userErr) {
      console.warn("[leaderboard] Could not load user names:", userErr);
    }

    const ranked = validRows
      .map((r) => {
        const avg = r._avg.emissionKg ?? 0;
        const count = r._count.id;
        const user = userMap.get(r.userId as string);
        return {
          userId: r.userId as string,
          name: user?.name ?? "Anonymous",
          image: user?.image ?? null,
          avgEmissionKg: Math.round(avg * 10) / 10,
          tripCount: count,
        };
      })
      .sort((a, b) => a.avgEmissionKg - b.avgEmissionKg)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    return NextResponse.json({ leaderboard: ranked });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[leaderboard]", msg, e);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard", detail: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 }
    );
  }
}

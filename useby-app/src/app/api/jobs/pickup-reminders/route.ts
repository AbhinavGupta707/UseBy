import { NextResponse } from "next/server";
import { runPickupReminderJob } from "@/server/jobs/pickup-reminders";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runPickupReminderJob({
    source: "/api/jobs/pickup-reminders",
  });

  return NextResponse.json(result, {
    status:
      result.status === "failed"
        ? 500
        : result.status === "unavailable"
          ? 503
          : 200,
  });
}

export const POST = GET;

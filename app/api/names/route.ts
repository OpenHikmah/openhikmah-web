import { NextResponse } from "next/server";
import { DIVINE_NAMES } from "@/lib/divine-names";

export async function GET() {
  return NextResponse.json(DIVINE_NAMES);
}

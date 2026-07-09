import { NextResponse } from "next/server";
import { DIVINE_NAMES } from "@/lib/names/divine-names";

export async function GET() {
  return NextResponse.json(DIVINE_NAMES);
}

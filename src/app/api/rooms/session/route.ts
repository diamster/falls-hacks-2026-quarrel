import { NextRequest } from "next/server";
import { roomRoute } from "@/server/room-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return roomRoute(request, "session"); }

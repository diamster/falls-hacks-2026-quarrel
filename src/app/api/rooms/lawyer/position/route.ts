import { NextRequest } from "next/server";
import { roomRoute } from "@/server/room-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: NextRequest) { return roomRoute(request, "lawyerPosition"); }

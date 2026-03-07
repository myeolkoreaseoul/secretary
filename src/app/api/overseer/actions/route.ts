import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");

  let query = supabaseAdmin
    .from("overseer_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_id, action_type, dry_run = true } = body;

  if (!project_id || !action_type) {
    return NextResponse.json(
      { error: "project_id and action_type required" },
      { status: 400 }
    );
  }

  // Create action record
  const { data, error } = await supabaseAdmin
    .from("overseer_actions")
    .insert({
      project_id,
      action_type,
      dry_run,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

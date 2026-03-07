import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Notion 트리 구조 — config.py의 NOTION_TREE와 동일
const NOTION_TREE = {
  id: "root",
  name: "루트",
  children: [
    {
      id: "31aa8c7e-ea73-8158-8e07-ea8fa3da5765",
      name: "정동회계법인",
      type: "org" as const,
      children: [
        {
          id: "31aa8c7e-ea73-8131-95d8-d8d4fbec7b23",
          name: "사내시스템",
          type: "category" as const,
          projects: ["jd-platform", "meeting-room"],
        },
        {
          id: "31aa8c7e-ea73-81f3-8843-e59a10db8375",
          name: "정산자동화",
          type: "category" as const,
          projects: ["tessera", "sangsi-checker", "rnd-audit-tool"],
        },
        {
          id: "31aa8c7e-ea73-812b-9380-c28a08e4637a",
          name: "외부고객서비스",
          type: "category" as const,
          projects: ["jd-audit-portal", "proposal-ai"],
        },
        {
          id: "31aa8c7e-ea73-811c-a5a8-ce2b407f9ebf",
          name: "기타/완료",
          type: "category" as const,
          projects: [],
        },
      ],
    },
    {
      id: "31aa8c7e-ea73-8116-a256-c167945ff3d3",
      name: "개인/사이드",
      type: "org" as const,
      children: [],
      projects: ["svvys", "secretary", "scouter"],
    },
    {
      id: "31aa8c7e-ea73-8101-a5ca-f2df14ad632f",
      name: "인프라/운영",
      type: "org" as const,
      children: [],
      projects: [],
    },
  ],
};

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("overseer_project_summary")
    .select("*")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    tree: NOTION_TREE,
    projects: data,
  });
}

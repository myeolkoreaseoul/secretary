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
          projects: [] as string[],
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
      projects: [] as string[],
    },
  ],
};

// category 문자열("정동회계법인 > 사내시스템") → 트리 노드로 매핑
function getKnownProjects(tree: typeof NOTION_TREE): Set<string> {
  const known = new Set<string>();
  for (const org of tree.children) {
    if ("projects" in org) {
      for (const p of org.projects ?? []) known.add(p);
    }
    if ("children" in org) {
      for (const cat of org.children ?? []) {
        if ("projects" in cat) {
          for (const p of cat.projects ?? []) known.add(p);
        }
      }
    }
  }
  return known;
}

function assignAutoDiscovered(
  tree: typeof NOTION_TREE,
  projects: Array<{ name: string; category?: string; auto_discovered?: boolean }>,
) {
  const known = getKnownProjects(tree);

  for (const proj of projects) {
    if (known.has(proj.name)) continue;
    if (!proj.category) continue;

    // "정동회계법인 > 사내시스템" 형태 파싱
    const parts = proj.category.split(" > ").map((s) => s.trim());
    const orgName = parts[0];
    const catName = parts[1] || null;

    const org = tree.children.find((o) => o.name === orgName);
    if (!org) continue;

    if (catName && "children" in org) {
      const cat = org.children.find((c) => c.name === catName);
      if (cat && "projects" in cat) {
        cat.projects.push(proj.name);
        known.add(proj.name);
        continue;
      }
    }

    // org 직속
    if ("projects" in org && org.projects) {
      org.projects.push(proj.name);
    }
    known.add(proj.name);
  }
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("overseer_project_summary")
    .select("*")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // auto-discovered 프로젝트를 트리에 동적 할당
  const tree = JSON.parse(JSON.stringify(NOTION_TREE));
  assignAutoDiscovered(tree, data ?? []);

  return NextResponse.json({
    tree,
    projects: data,
  });
}

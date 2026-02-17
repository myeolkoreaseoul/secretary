import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Category, TelegramMessage } from "@/types";
import { CategoriesClient } from "./client";

export const dynamic = "force-dynamic";

async function getCategories(): Promise<Category[]> {
  const { data } = await supabaseAdmin
    .from("categories")
    .select("*")
    .order("name");
  return data || [];
}

async function getMessagesByCategory(): Promise<
  Record<string, TelegramMessage[]>
> {
  const { data } = await supabaseAdmin
    .from("telegram_messages")
    .select("*, category:categories(id, name, color)")
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(200);

  const grouped: Record<string, TelegramMessage[]> = {};
  for (const msg of data || []) {
    const catName =
      (msg.category as unknown as Category)?.name || "미분류";
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(msg as unknown as TelegramMessage);
  }
  return grouped;
}

export default async function CategoriesPage() {
  const [categories, messagesByCategory] = await Promise.all([
    getCategories(),
    getMessagesByCategory(),
  ]);

  return (
    <CategoriesClient
      categories={categories}
      messagesByCategory={messagesByCategory}
    />
  );
}

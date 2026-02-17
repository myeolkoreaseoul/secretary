"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Category, TelegramMessage, MessageClassification } from "@/types";

interface Props {
  categories: Category[];
  messagesByCategory: Record<string, TelegramMessage[]>;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${hours}:${mins}`;
}

export function CategoriesClient({ categories, messagesByCategory }: Props) {
  const allCategoryNames = [
    "전체",
    ...categories.map((c) => c.name),
    ...(messagesByCategory["미분류"]?.length ? ["미분류"] : []),
  ];

  const [activeTab, setActiveTab] = useState("전체");

  const getMessages = (catName: string) => {
    if (catName === "전체") {
      return Object.values(messagesByCategory).flat().sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return messagesByCategory[catName] || [];
  };

  const messages = getMessages(activeTab);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">카테고리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          텔레그램 메시지를 카테고리별로 확인합니다
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
          {allCategoryNames.map((name) => {
            const count =
              name === "전체"
                ? Object.values(messagesByCategory).flat().length
                : (messagesByCategory[name]?.length || 0);
            return (
              <TabsTrigger key={name} value={name} className="text-xs">
                {name}
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
                  {count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {allCategoryNames.map((name) => (
          <TabsContent key={name} value={name}>
            {name === activeTab && (
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    이 카테고리에 메시지가 없습니다
                  </p>
                ) : (
                  messages.map((msg) => (
                    <MessageCard key={msg.id} message={msg} />
                  ))
                )}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function MessageCard({ message }: { message: TelegramMessage }) {
  const cls = message.classification as MessageClassification | null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            {cls?.title || message.content.slice(0, 40)}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {formatDate(message.created_at)}
          </span>
        </div>
        {cls?.summary && (
          <CardDescription className="text-xs">
            {cls.summary}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {message.content}
        </p>
        {cls?.advice && (
          <p className="text-xs text-primary mt-2">{cls.advice}</p>
        )}
        {cls?.entities && cls.entities.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {cls.entities.map((e, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {e}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

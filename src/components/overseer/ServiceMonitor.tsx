"use client";

import { Radio, Globe, Server } from "lucide-react";

interface SvcData {
  pm2_status?: string | null;
  pm2_name?: string | null;
  port?: number | null;
  port_open?: boolean;
  tunnel_url?: string | null;
  tunnel_alive?: boolean;
  svc_scanned?: string;
}

export function ServiceMonitor({ data }: { data: SvcData }) {
  const hasService = data.pm2_name || data.port;
  if (!hasService) return null;

  return (
    <div className="flex items-center gap-3 text-xs">
      {data.pm2_name && (
        <div className="flex items-center gap-1">
          <Server className="w-3 h-3 text-muted-foreground" />
          <span className={
            data.pm2_status === "online" ? "text-green-400" : "text-zinc-500"
          }>
            {data.pm2_name}
          </span>
          <span className={
            data.pm2_status === "online"
              ? "w-1.5 h-1.5 rounded-full bg-green-400 inline-block"
              : "w-1.5 h-1.5 rounded-full bg-zinc-500 inline-block"
          } />
        </div>
      )}
      {data.port && (
        <div className="flex items-center gap-1">
          <Radio className="w-3 h-3 text-muted-foreground" />
          <span className={data.port_open ? "text-green-400" : "text-zinc-500"}>
            :{data.port}
          </span>
        </div>
      )}
      {data.tunnel_url && (
        <div className="flex items-center gap-1">
          <Globe className="w-3 h-3 text-muted-foreground" />
          <span className={data.tunnel_alive ? "text-green-400" : "text-zinc-500"}>
            터널
          </span>
        </div>
      )}
    </div>
  );
}

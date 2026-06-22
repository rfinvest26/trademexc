import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type TradeRealtimeChannel = RealtimeChannel;

export interface TableChangePayload<TNew extends Record<string, unknown> = Record<string, unknown>, TOld extends Record<string, unknown> = TNew> {
  new: TNew;
  old: TOld;
}

export interface TableChangeSubscriptionOptions {
  channel: string;
  schema?: string;
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
}

let channelSeq = 0;

export function subscribeToTableChanges<TNew extends Record<string, unknown> = Record<string, unknown>, TOld extends Record<string, unknown> = TNew>(
  client: SupabaseClient,
  options: TableChangeSubscriptionOptions,
  onChange: (payload: TableChangePayload<TNew, TOld>) => void,
  onStatus?: (status: string) => void,
): TradeRealtimeChannel {
  // Суффикс делает имя канала уникальным на каждый вызов: removeChannelDeferred
  // удаляет канал с задержкой, и если эффект пересоздаёт подписку раньше
  // (например React StrictMode mount→unmount→mount в dev), client.channel(name)
  // с тем же именем вернёт ещё не удалённый, уже subscribed канал — и .on()
  // на нём бросит "cannot add postgres_changes callbacks ... after subscribe()".
  const channelName = `${options.channel}:${++channelSeq}`;

  return client
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: options.event ?? "*",
        schema: options.schema ?? "public",
        table: options.table,
        filter: options.filter,
      },
      (payload: { new: unknown; old: unknown }) => {
        onChange({
          new: (payload.new ?? {}) as TNew,
          old: (payload.old ?? {}) as TOld,
        });
      },
    )
    .subscribe((status: string) => {
      onStatus?.(status);
    });
}

export interface RowUpdateSubscriptionOptions {
  channel: string;
  schema?: string;
  table: string;
  filter?: string;
}

export function subscribeToRowUpdates<TNew extends Record<string, unknown> = Record<string, unknown>, TOld extends Record<string, unknown> = TNew>(
  client: SupabaseClient,
  options: RowUpdateSubscriptionOptions,
  onUpdate: (payload: TableChangePayload<TNew, TOld>) => void,
  onStatus?: (status: string) => void,
): TradeRealtimeChannel {
  return subscribeToTableChanges<TNew, TOld>(client, { ...options, event: "UPDATE" }, onUpdate, onStatus);
}

export function removeChannelDeferred(client: SupabaseClient, channel: TradeRealtimeChannel | null | undefined, delayMs = 100): void {
  if (!channel) return;
  setTimeout(() => {
    void client.removeChannel(channel);
  }, delayMs);
}

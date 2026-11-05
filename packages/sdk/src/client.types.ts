import type { ObjectKind } from "./schemas.schema.js";
export type ClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
} & (
  | { token: string; sessionCookie?: never }
  | { token?: never; sessionCookie: string }
);
export interface RequestOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
}
export interface PageOptions {
  cursor?: string;
  limit?: number;
}
export interface ObjectFilters extends PageOptions {
  kind?: ObjectKind;
  q?: string;
  tag?: string;
  status?: string;
  archived?: boolean;
}
export interface NoteFilters extends PageOptions {
  targetId?: string;
  status?: string;
}

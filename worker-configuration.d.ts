// Cloudflare Worker / Durable Object ambient types (committed).
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectId {}
interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
interface DurableObjectState {}
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
interface CloudflareWebSocket extends WebSocket {
  accept(): void;
}
interface WebSocketPair {
  0: CloudflareWebSocket;
  1: CloudflareWebSocket;
}
declare const WebSocketPair: { new (): WebSocketPair };

interface ResponseInit {
  webSocket?: CloudflareWebSocket;
}

interface CloudflareEnv {
  ARENA: DurableObjectNamespace;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS: string;
}
interface Env extends CloudflareEnv {}

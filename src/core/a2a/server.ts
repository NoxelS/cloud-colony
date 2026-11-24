import { once } from "node:events";
import { createServer } from "node:http";
import type { AgentCard } from "@a2a-js/sdk";
import type { A2ARequestHandler } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import express from "express";

type CardMetadata = Omit<AgentCard, "supportedInterfaces">;

export async function startA2aServer(
  metadata: CardMetadata,
  createRequestHandler: (card: AgentCard) => A2ARequestHandler,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const portSetting = env.PORT ?? "8080";
  const port = Number(portSetting);
  if (!/^\d+$/.test(portSetting) || port > 65535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  let baseUrl: URL | undefined;
  if (env.A2A_BASE_URL?.trim()) {
    baseUrl = URL.parse(env.A2A_BASE_URL) ?? undefined;
    if (
      !baseUrl ||
      !["http:", "https:"].includes(baseUrl.protocol) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.pathname !== "/" ||
      baseUrl.search ||
      baseUrl.hash
    ) {
      throw new Error("A2A_BASE_URL must be an HTTP or HTTPS origin.");
    }
  }

  const app = express();
  app.disable("x-powered-by");
  const server = createServer(app);
  server.listen(port, "0.0.0.0");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP listener.");

  const card: AgentCard = {
    ...metadata,
    supportedInterfaces: [
      {
        url: baseUrl?.href ?? `http://127.0.0.1:${address.port}/`,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
        tenant: "",
      },
    ],
  };
  const requestHandler = createRequestHandler(card);
  const discovery = agentCardHandler({ agentCardProvider: requestHandler });
  const rpc = jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication });
  app.get("/healthz", (_req, res) => res.sendStatus(200));
  app.get("/readyz", (_req, res) => res.sendStatus(200));
  app.use("/.well-known/agent-card.json", discovery);
  app.post("/", rpc);

  function shutdown() {
    const deadline = setTimeout(() => server.closeAllConnections(), 35_000);
    deadline.unref();
    server.close(() => clearTimeout(deadline));
  }
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.once("close", () => {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
  });

  console.log(`A2A listening on port ${address.port}`);
}

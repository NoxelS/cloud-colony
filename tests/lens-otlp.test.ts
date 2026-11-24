import { describe, expect, it, vi } from "vitest";
import { LensOtlpTelemetry } from "../src/core/telemetry/lens-otlp.js";

describe("Lens OTLP telemetry", () => {
  it("exports Pi chat requests as GenAI client spans within the agent trace", async () => {
    const requests: unknown[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const telemetry = new LensOtlpTelemetry(
        "http://localhost:4318/v1/traces",
        "key",
        "test-agent",
      );
      await telemetry.startSpan({ name: "root" }, async (span) => {
        await span.startSpan({ name: "child" }, async () => {});
        await span.startSpan(
          { name: "pi.durable.phase", attributes: { "task.name": "pi.tool" } },
          async (tool) => {
            tool.setAttributes({ "tool.name": "look-up", "tool.call_id": "call-1" });
          },
        );
        await span.startSpan(
          {
            name: "pi.ai.request",
            attributes: { api: "openai-completions", provider: "litellm", model: "test-model" },
          },
          (request) => {
            request.setAttributes({ "usage.input": 10, "usage.output": 3, "usage.cache_read": 2 });
          },
        );
      });
      await telemetry.flush();
      const spans = requests.flatMap((body) => {
        const data = body as {
          resourceSpans: {
            scopeSpans: {
              spans: {
                name: string;
                traceId: string;
                spanId: string;
                parentSpanId?: string;
                kind: number;
                attributes: { key: string; value: object }[];
              }[];
            }[];
          }[];
        };
        return data.resourceSpans.flatMap((resource) =>
          resource.scopeSpans.flatMap((scope) => scope.spans),
        );
      });
      const root = spans.find((span) => span.name === "root");
      const child = spans.find((span) => span.name === "child");
      expect(root).toBeDefined();
      expect(child).toMatchObject({
        traceId: root?.traceId,
        parentSpanId: root?.spanId,
        kind: 1,
        attributes: [],
      });
      const tool = spans.find((span) => span.name === "look-up");
      expect(tool).toMatchObject({ traceId: root?.traceId, parentSpanId: root?.spanId });
      expect(tool?.attributes).toEqual(
        expect.arrayContaining([
          { key: "gen_ai.operation.name", value: { stringValue: "execute_tool" } },
          { key: "gen_ai.tool.name", value: { stringValue: "look-up" } },
          { key: "gen_ai.tool.call.id", value: { stringValue: "call-1" } },
        ]),
      );
      const request = spans.find((span) => span.name === "pi.ai.request");
      expect(request).toMatchObject({
        traceId: root?.traceId,
        parentSpanId: root?.spanId,
        kind: 3,
      });
      expect(request?.attributes).toEqual(
        expect.arrayContaining([
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          { key: "gen_ai.request.model", value: { stringValue: "test-model" } },
          { key: "gen_ai.provider.name", value: { stringValue: "litellm" } },
          { key: "gen_ai.usage.input_tokens", value: { intValue: "12" } },
          { key: "gen_ai.usage.output_tokens", value: { intValue: "3" } },
        ]),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it("continues a trace after its context is propagated", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(String(init?.body));
      return new Response("{}", { status: 200 });
    }),
  );
  try {
    const telemetry = new LensOtlpTelemetry("http://localhost:4318/v1/traces", "key", "test-agent");
    await telemetry.startSpan({ name: "root" }, async (root) => {
      const carrier = root.propagation?.inject(root);
      await telemetry.propagation.extract(carrier).startSpan({ name: "resumed" }, async () => {});
    });
    await telemetry.flush();
    const spans = requests.map(
      (request) => JSON.parse(request).resourceSpans[0].scopeSpans[0].spans[0],
    );
    const root = spans.find((span) => span.name === "root");
    const resumed = spans.find((span) => span.name === "resumed");
    expect(resumed).toMatchObject({ traceId: root.traceId, parentSpanId: root.spanId });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("uses a link context as the parent of a new root span", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(String(init?.body));
      return new Response("{}", { status: 200 });
    }),
  );
  try {
    const telemetry = new LensOtlpTelemetry("http://localhost:4318/v1/traces", "key", "test-agent");
    await telemetry.startSpan({ name: "root" }, async (root) => {
      await telemetry.startSpan(
        { name: "linked-child", links: [{ context: root }] },
        async () => {},
      );
    });
    await telemetry.flush();
    const spans = requests.map(
      (request) => JSON.parse(request).resourceSpans[0].scopeSpans[0].spans[0],
    );
    const root = spans.find((span) => span.name === "root");
    const child = spans.find((span) => span.name === "linked-child");
    expect(child).toMatchObject({ traceId: root.traceId, parentSpanId: root.spanId });
  } finally {
    vi.unstubAllGlobals();
  }
});

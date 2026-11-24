import { randomBytes } from "node:crypto";
import type {
  SpanAttributes,
  SpanOptions,
  SpanStatus,
  TelemetryCarrier,
  TelemetryContext,
  TelemetryPropagation,
  TelemetrySpan,
} from "@earendil-works/pi-telemetry";

interface SpanRecord {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startedAt: number;
  readonly attributes: Record<string, string | number | boolean>;
  readonly events: {
    name: string;
    time: number;
    attributes: Record<string, string | number | boolean>;
  }[];
  status: SpanStatus;
  endedAt?: number;
}

function id(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function attributes(values: SpanAttributes = {}): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string | number | boolean] =>
      ["string", "number", "boolean"].includes(typeof entry[1]),
    ),
  );
}

function anyValue(value: string | number | boolean): object {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
}

function keyValues(values: Record<string, string | number | boolean>): object[] {
  return Object.entries(values).map(([key, value]) => ({ key, value: anyValue(value) }));
}

export class LensOtlpTelemetry implements TelemetryContext {
  private readonly pending = new Set<Promise<void>>();
  private readonly extracted = new WeakMap<TelemetryContext, TelemetryCarrier>();
  readonly propagation: TelemetryPropagation = {
    inject: (context) =>
      context instanceof LensSpan ? context.carrier : this.extracted.get(context),
    extract: (carrier) => {
      const traceId = carrier?.traceId;
      const spanId = carrier?.spanId;
      if (
        !traceId ||
        !spanId ||
        !/^[0-9a-f]{32}$/.test(traceId) ||
        !/^[0-9a-f]{16}$/.test(spanId)
      ) {
        return this;
      }
      const parent = { traceId, spanId };
      const context: TelemetryContext = {
        startSpan: (options, callback) => this.startSpanFrom(options, callback, parent),
        propagation: this.propagation,
      };
      this.extracted.set(context, parent);
      return context;
    },
  };

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly serviceName: string,
  ) {}

  startSpan<T>(
    options: SpanOptions,
    callback: (span: TelemetrySpan) => T | Promise<T>,
  ): Promise<T> {
    const linked = options.links?.[0]?.context;
    return this.startSpanFrom(options, callback, linked && this.propagation.inject(linked));
  }

  async startSpanFrom<T>(
    options: SpanOptions,
    callback: (span: TelemetrySpan) => T | Promise<T>,
    parent?: TelemetryCarrier,
  ): Promise<T> {
    const values = attributes(options.attributes);
    const toolPhase = options.name === "pi.durable.phase" && values["task.name"] === "pi.tool";
    // Keep scheduler contexts available to Pi, with descendants attached to the nearest exported span.
    const internal =
      options.name === "pi.durable.submit" || (options.name === "pi.durable.phase" && !toolPhase);
    const record: SpanRecord = {
      traceId: parent?.traceId ?? id(16),
      spanId: id(8),
      ...(parent?.spanId && { parentSpanId: parent.spanId }),
      name: options.name,
      startedAt: Date.now(),
      attributes: values,
      events: [],
      status: { status: "ok" },
    };
    const span = new LensSpan(
      record,
      this,
      internal && parent
        ? parent
        : {
            traceId: record.traceId,
            spanId: record.spanId,
          },
    );
    try {
      return await callback(span);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error("Agent operation failed.");
      span.setStatus({
        status: "error",
        error: { name: cause.name, message: cause.message.slice(0, 500) },
      });
      throw error;
    } finally {
      if (!internal || !parent) {
        record.endedAt = Date.now();
        this.finish(record);
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  private finish(record: SpanRecord): void {
    const work = this.export(record).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Lens trace export failed.");
    });
    this.pending.add(work);
    void work.then(() => this.pending.delete(work));
  }

  private async export(record: SpanRecord): Promise<void> {
    const values = record.attributes;
    const isChat = record.name === "pi.ai.request" && values.api === "openai-completions";
    const input = values["usage.input"];
    const output = values["usage.output"];
    const cacheRead = values["usage.cache_read"];
    const cacheWrite = values["usage.cache_write"];
    const isTool = record.name === "pi.durable.phase" && values["task.name"] === "pi.tool";
    const toolName = values["tool.name"];
    const genAi = isChat
      ? attributes({
          "gen_ai.operation.name": "chat",
          "gen_ai.provider.name": values.provider,
          "gen_ai.request.model": values.model,
          "gen_ai.response.id": values["response.id"],
          // Pi reports uncached input separately from cache reads and writes.
          "gen_ai.usage.input_tokens":
            typeof input === "number"
              ? input +
                (typeof cacheRead === "number" ? cacheRead : 0) +
                (typeof cacheWrite === "number" ? cacheWrite : 0)
              : undefined,
          "gen_ai.usage.output_tokens": output,
        })
      : isTool
        ? attributes({
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": toolName,
            "gen_ai.tool.call.id": values["tool.call_id"],
          })
        : {};
    const body = {
      resourceSpans: [
        {
          resource: { attributes: keyValues({ "service.name": this.serviceName }) },
          scopeSpans: [
            {
              scope: { name: "@cloud-colony/agent", version: "1.0.0" },
              spans: [
                {
                  traceId: record.traceId,
                  spanId: record.spanId,
                  ...(record.parentSpanId && { parentSpanId: record.parentSpanId }),
                  name: isTool && typeof toolName === "string" ? toolName : record.name,
                  kind: isChat ? 3 : 1,
                  startTimeUnixNano: String(record.startedAt * 1_000_000),
                  endTimeUnixNano: String((record.endedAt ?? Date.now()) * 1_000_000),
                  attributes: keyValues({ ...genAi, ...values }),
                  events: record.events.map((event) => ({
                    name: event.name,
                    timeUnixNano: String(event.time * 1_000_000),
                    attributes: keyValues(event.attributes),
                  })),
                  status:
                    record.status.status === "error"
                      ? { code: 2, message: record.status.error?.message }
                      : { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Network request failed.";
      throw new Error(`Lens trace export failed to reach ${this.endpoint}: ${detail}`);
    }
    if (!response.ok) throw new Error(`Lens trace export failed with HTTP ${response.status}.`);
  }
}

class LensSpan implements TelemetrySpan {
  get propagation(): TelemetryPropagation {
    return this.owner.propagation;
  }

  constructor(
    readonly record: SpanRecord,
    private readonly owner: LensOtlpTelemetry,
    readonly carrier: TelemetryCarrier,
  ) {}

  startSpan<T>(
    options: SpanOptions,
    callback: (span: TelemetrySpan) => T | Promise<T>,
  ): Promise<T> {
    return this.owner.startSpanFrom(options, callback, this.carrier);
  }

  addLink(): void {}

  addEvent(name: string, values: SpanAttributes = {}): void {
    this.record.events.push({ name, time: Date.now(), attributes: attributes(values) });
  }

  setAttributes(values: SpanAttributes): void {
    Object.assign(this.record.attributes, attributes(values));
  }

  setStatus(status: SpanStatus): void {
    this.record.status = status;
  }
}

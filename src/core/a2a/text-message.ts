import { randomUUID } from "node:crypto";
import { type AgentCard, Role } from "@a2a-js/sdk";
import {
  ContentTypeNotSupportedError,
  ExtendedAgentCardNotConfiguredError,
  PushNotificationNotSupportedError,
  RequestMalformedError,
  TaskNotFoundError,
  UnsupportedOperationError,
} from "@a2a-js/sdk/errors";
import type { A2ARequestHandler } from "@a2a-js/sdk/server";

export function createTextMessageHandler(
  card: AgentCard,
  reply: (text: string) => Promise<string>,
): A2ARequestHandler {
  async function taskNotFound(): Promise<never> {
    throw new TaskNotFoundError();
  }

  async function pushNotSupported(): Promise<never> {
    throw new PushNotificationNotSupportedError();
  }

  return {
    async getAgentCard() {
      return card;
    },
    async getAuthenticatedExtendedAgentCard() {
      throw new ExtendedAgentCardNotConfiguredError();
    },
    async sendMessage({ message }) {
      if (!message?.messageId || message.role !== Role.ROLE_USER || !message.parts.length) {
        throw new RequestMalformedError(
          "Send a user message with an ID and at least one text part.",
        );
      }
      if (message.taskId || message.referenceTaskIds.length) {
        throw new TaskNotFoundError();
      }

      const parts = message.parts.map(({ content, mediaType }) => {
        if (content?.$case !== "text" || (mediaType && mediaType !== "text/plain")) {
          throw new ContentTypeNotSupportedError("Only plain text parts are supported.");
        }
        return content.value;
      });
      const text = parts.join("\n").trim();
      if (!text) throw new RequestMalformedError("Send a non-empty text message.");

      const answer = await reply(text);
      return {
        messageId: randomUUID(),
        contextId: message.contextId || randomUUID(),
        taskId: "",
        role: Role.ROLE_AGENT,
        parts: [
          {
            content: { $case: "text", value: answer },
            filename: "",
            mediaType: "",
            metadata: undefined,
          },
        ],
        extensions: [],
        referenceTaskIds: [],
        metadata: undefined,
      };
    },
    sendMessageStream() {
      throw new UnsupportedOperationError("Streaming is not supported.");
    },
    getTask: taskNotFound,
    cancelTask: taskNotFound,
    async listTasks({ pageSize }) {
      return { tasks: [], nextPageToken: "", pageSize: pageSize ?? 50, totalSize: 0 };
    },
    resubscribe() {
      throw new TaskNotFoundError();
    },
    createTaskPushNotificationConfig: pushNotSupported,
    getTaskPushNotificationConfig: pushNotSupported,
    listTaskPushNotificationConfigs: pushNotSupported,
    deleteTaskPushNotificationConfig: pushNotSupported,
  };
}

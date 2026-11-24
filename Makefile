ENV_FILE ?= .env
A2A_PORT ?= 8080

.PHONY: hello-world-agent FORCE

hello-world-agent: chat-hello-world

chat-%: FORCE
	@test -f "src/agents/$*/Dockerfile" || { echo "Unknown agent: $*" >&2; exit 1; }
	@test -r "$(ENV_FILE)" || { echo "Configure LiteLLM in $(ENV_FILE) before starting the agent." >&2; exit 1; }
	docker build --file "src/agents/$*/Dockerfile" --tag "cloud-colony-$*:local" .
	@set -eu; \
	origin="http://127.0.0.1:$(A2A_PORT)"; \
	container=$$(docker run --detach --rm \
		--env-file "$(ENV_FILE)" --env PORT=8080 --env "A2A_BASE_URL=$$origin" \
		--publish "127.0.0.1:$(A2A_PORT):8080" "cloud-colony-$*:local"); \
	trap 'docker stop --time 40 "$$container" >/dev/null 2>&1 || :' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	attempts=0; \
	until curl --fail --silent --max-time 1 "$$origin/readyz" >/dev/null; do \
		attempts=$$((attempts + 1)); \
		if [ "$$attempts" -ge 30 ] || ! docker inspect "$$container" >/dev/null 2>&1; then \
			echo "Agent did not become ready at $$origin" >&2; \
			docker logs "$$container" >&2 2>/dev/null || :; \
			exit 1; \
		fi; \
		sleep 1; \
	done; \
	pnpm a2a:client "$$origin"

FORCE:

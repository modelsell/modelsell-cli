export const agentSkill = `---
name: modelsell
description: Discover and invoke Modelsell models from the terminal, including text, images, video, audio, embeddings, reranking, and 3D. Use when the user asks to run Modelsell models or retrieve their generated results.
---

# Modelsell model invocation

Use the installed modelsell CLI. Credentials come from MODELSELL_API_KEY or modelsell login; never print keys or put them in project files.

Discover models with modelsell models <query> --json. With a key, the list is restricted to that key; --all shows the public catalog and does not imply access.
Inspect modelsell schema <model> --json or modelsell run <model> --help. Metadata may contain only protocol defaults, not the complete model schema. Use documented native parameters through -i key=value or --input-file request.json.

Run modelsell run <model> -p 'prompt' --json. --endpoint selects a specific protocol, such as anthropic, gemini, image-generation, openai-video, speech, or embeddings. For complex inputs use --input-file; tools, messages and explicit 0/false are preserved. --dry-run previews the request without sending it.

For uploads, --file field=./file sends multipart data. In JSON input, explicit @file becomes a data URI, which requires provider support. Asset upload requires a provider-specific --input-file or --file payload; consult that model's API docs. Do not invent a universal upload URL or schema.

Async jobs are automatically polled. --no-wait returns a task ID; resume with modelsell wait <id> --json, or inspect modelsell show <id> --json. A timeout or network interruption does not mean generation was rejected: never automatically repeat a submit. Task completion does not prove media delivery; use --download ./output and inspect the saved media when the user needs files.

Use modelsell request /native/path --method POST --input-file request.json --json for native features. It sends only to the configured API origin. modelsell endpoints --json lists known protocol adapters. modelsell realtime <model> bridges native WebSocket events as JSONL on stdin/stdout; audio must be encoded in native events.

--stream --json emits JSONL events; other --json commands emit one JSON value. Errors have nonzero exit codes. Progress goes to stderr. modelsell price shows public pricing metadata, not a user-specific quote. modelsell usage reports API-key quota in server units, not the account's cash balance. modelsell history lists only locally recorded tasks.

Project aliases are stored in modelsell.json with defaultModel and aliases: {name: {model, endpoint, input}}. They cannot change the credential destination. Preserve the user's prompt and requested parameters. Do not modify other agent configuration unless requested; modelsell configure is a separate workflow.
`;

# Agentify runtime (OpenCode)

OpenCode-owned ChatGPT Web and Claude Web helper adapted from Agentify Desktop (MPL-2.0).

OpenCode starts this Node process only on the first `agentify/chatgpt-web` or `agentify/claude-web` request. It launches managed Edge over Chrome DevTools Protocol with a fresh isolated profile under `%USERPROFILE%\.local\share\opencode\agentify-runtime`. Electron is not used. Login cookies from `%USERPROFILE%\.agentify-desktop` are not reused.

The OpenCode build packages these assets next to `opencode.exe` and resolves them from the executable directory.

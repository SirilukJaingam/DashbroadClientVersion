# Claude CLI -> OpenRouter Setup

## Files Used

- `ccp.exe`
  - Go proxy that translates Claude Code API calls to OpenRouter.
- `claude-openrouter.bat`
  - General launcher.
- `GPT-5.bat`
  - Launcher pinned to GPT-5.
- `Gemini-Flash.bat`
  - Launcher pinned to Gemini Flash.
- `DeepSeek.bat`
  - Launcher pinned to DeepSeek.
- `C:\Users\Dev\.claude\proxy.env`
  - Main config file read by `ccp.exe`.

## Required Config

Stored in `C:\Users\Dev\.claude\proxy.env`:

```env
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=<your-openrouter-key>
ANTHROPIC_DEFAULT_SONNET_MODEL=gpt-5
ANTHROPIC_DEFAULT_HAIKU_MODEL=gpt-5-mini
ANTHROPIC_DEFAULT_OPUS_MODEL=gpt-5
```

## Windows Note

`ccp.exe` expects a tmp folder on the current drive root.

Needed once:

```powershell
mkdir G:\tmp
```

## Normal Procedure

1. Double-click one of the `.bat` launchers.
2. The launcher starts `ccp.exe` on `http://127.0.0.1:8082`.
3. It sets:
   - `ANTHROPIC_BASE_URL=http://127.0.0.1:8082`
   - `ANTHROPIC_API_KEY=<same OpenRouter key used for proxying>`
4. It launches:

```powershell
claude --bare
```

5. When Claude exits, the launcher stops the proxy.

## Model Variants

- `GPT-5.bat`
  - `gpt-5` / `gpt-5-mini`
  - Fastest tested setup.
- `Gemini-Flash.bat`
  - `google/gemini-3.5-flash`
- `DeepSeek.bat`
  - `deepseek/deepseek-chat`
  - Cheapest, but much slower on routed provider.

## What We Found

- Proxy overhead was negligible.
- Slow responses were mainly caused by the selected model/provider, not by local translation.
- DeepSeek route was slow.
- GPT-5 route was much faster.

## Quick Test

To verify the proxy path manually:

```powershell
$env:ANTHROPIC_BASE_URL="http://127.0.0.1:8082"
$env:ANTHROPIC_API_KEY="<your-openrouter-key>"
claude -p "say hi" --print
```

## If It Fails

- Check `C:\Users\Dev\.claude\proxy.env` exists.
- Check `G:\tmp` exists.
- Check port `8082` is free.
- Restart the launcher.
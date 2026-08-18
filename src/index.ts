/**
 * dsh-jailbreak-manager: a host-plane plugin that injects a model-specific
 * jailbreak/破限词 section into DSH Desktop conversations.
 *
 * The section uses `systemPrompt.section({ text: (context) => ... })`, so its
 * content is re-evaluated on every prompt assembly. This makes both manual
 * model selection and wordbook edits take effect without restarting DSH or
 * touching the story preset's `agent.cordis.yml`.
 * @module dsh-jailbreak-manager
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Declaration merge only: makes ctx.systemPrompt and ctx.settings visible.
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-settings'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  CONFIG_NS,
  CONFIG_SCHEMA,
  DEFAULT_FALLBACK,
  listJailbreaks,
  listModelKeys,
  readJailbreak,
  resolveModelKey,
  writeJailbreak,
  type ManagerMode,
  type ModelKey,
} from './jailbreak.ts'

/** Web-server service key candidates, newest first. */
const WEB_SERVER_KEYS = ['webServer', 'httpServer'] as const

/** Same-origin settings-page endpoint prefix. */
const ROUTE_BASE = '/plugins/dsh-jailbreak-manager'

/** Send one JSON response with the settings API's no-cache policy. */
function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

/** Read one small JSON request body, rejecting malformed or oversized input. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 256 * 1024) throw new Error('request body too large')
    chunks.push(bytes)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return undefined
  return JSON.parse(text)
}

export const name = 'dsh-jailbreak-manager'
export const inject = ['systemPrompt', 'settings']

/** Plugin configuration. */
export interface Config {
  /** Prompt-section order (persona is `0`; jailbreak lands right after). */
  promptSectionOrder?: number
}

export const Config: z<Config> = z.object({
  promptSectionOrder: z.natural().default(10),
})

/** The resolved jailbreak section text for one prompt assembly. */
function jailbreakSectionText(
  config: { mode: ManagerMode; model: string; fallback: ModelKey },
  route: { provider?: string; model?: string } | undefined,
): string {
  if (config.mode === 'off') return ''
  const knownKeys = listModelKeys()
  const key = resolveModelKey(config, route, knownKeys)
  return readJailbreak(`${key}.md`)
}

export function apply(ctx: Context, config: Config): void {
  const configScope = ctx.settings.register(CONFIG_NS, CONFIG_SCHEMA)
  const loadConfig = (): { mode: ManagerMode; model: string; fallback: ModelKey } => {
    const value = configScope.get() as { mode?: ManagerMode; model?: string; fallback?: ModelKey } | undefined
    const knownKeys = listModelKeys()
    const fallback = typeof value?.fallback === 'string' && knownKeys.includes(value.fallback)
      ? value.fallback
      : knownKeys.includes(DEFAULT_FALLBACK)
        ? DEFAULT_FALLBACK
        : knownKeys[0] ?? DEFAULT_FALLBACK
    return {
      mode: value?.mode === 'off' ? 'off' : value?.mode === 'manual' ? 'manual' : 'auto',
      model: typeof value?.model === 'string' ? value.model : '',
      fallback,
    }
  }

  // Re-evaluated on every prompt assembly: automatic detection uses
  // context.agent.options; manual selection (settings page) wins when set.
  ctx.systemPrompt.section({
    name: 'dsh-jailbreak-manager:jailbreak',
    order: config.promptSectionOrder ?? 10,
    text: (context) => jailbreakSectionText(loadConfig(), context.agent?.options),
  })

  // Same-origin settings routes (no `harness.handle` in installed packages).
  let webRegistered = false
  const registerWebSurface = (): void => {
    if (webRegistered) return
    const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1])) as
      | { register(route: { kind: 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void }
      | undefined
    if (webServer === undefined) return
    webRegistered = true
    ctx.effect(() => {
      const disposeConfig = webServer.register({
        kind: 'exact',
        path: `${ROUTE_BASE}/config`,
        handler: async (req, res) => {
          if (req.method === 'GET') {
            writeJson(res, 200, loadConfig())
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'GET, POST' })
            res.end()
            return
          }
          let body: unknown
          try {
            body = await readJson(req)
          } catch {
            writeJson(res, 400, { ok: false, error: 'invalid JSON body' })
            return
          }
          const knownKeys = listModelKeys()
          const mode = (body as { mode?: unknown } | null)?.mode
          const model = (body as { model?: unknown } | null)?.model
          const fallbackValue = (body as { fallback?: unknown } | null)?.fallback
          if (mode !== 'off' && mode !== 'auto' && mode !== 'manual') {
            writeJson(res, 400, { ok: false, error: 'mode must be "off", "auto" or "manual"' })
            return
          }
          if (typeof model !== 'string' || (mode === 'manual' && !knownKeys.includes(model))) {
            writeJson(res, 400, { ok: false, error: `model must be one of ${knownKeys.join('/')}` })
            return
          }
          const fallback = typeof fallbackValue === 'string' && knownKeys.includes(fallbackValue)
            ? fallbackValue
            : loadConfig().fallback
          await configScope.replace({ mode, model: mode === 'manual' ? model : '', fallback })
          writeJson(res, 200, { ok: true, config: loadConfig() })
        },
      })
      const disposeJailbreaks = webServer.register({
        kind: 'exact',
        path: `${ROUTE_BASE}/jailbreaks`,
        handler: async (req, res) => {
          if (req.method === 'GET') {
            writeJson(res, 200, { files: listJailbreaks() })
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'GET, POST' })
            res.end()
            return
          }
          let body: unknown
          try {
            body = await readJson(req)
          } catch {
            writeJson(res, 400, { ok: false, error: 'invalid JSON body' })
            return
          }
          const file = (body as { file?: unknown } | null)?.file
          const content = (body as { content?: unknown } | null)?.content
          if (typeof file !== 'string' || typeof content !== 'string') {
            writeJson(res, 400, { ok: false, error: 'file and content must be strings' })
            return
          }
          try {
            writeJailbreak(file, content)
          } catch (err: unknown) {
            writeJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
            return
          }
          writeJson(res, 200, { ok: true, file, size: content.length })
        },
      })
      return () => {
        disposeConfig()
        disposeJailbreaks()
      }
    }, 'dsh-jailbreak-manager: settings routes')
  }
  registerWebSurface()
  ctx.on('internal/service', (serviceName) => {
    if ((WEB_SERVER_KEYS as readonly string[]).includes(serviceName)) registerWebSurface()
  })
}

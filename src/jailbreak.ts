/**
 * Jailbreak-wordbook storage and model mapping for dsh-jailbreak-manager.
 *
 * The wordbook is intentionally plain `.md` files under `jailbreaks/`. The
 * host reads them on every system-prompt assembly, so edits take effect
 * without restarting DSH.
 * @module dsh-jailbreak-manager/jailbreak
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'

/** Settings namespace for the manager's mode/model selection. */
export const CONFIG_NS = settingsNamespace('dsh-jailbreak-manager')

/** Persisted user selection: `off` = disabled, `auto` = follow the active agent's model. */
export type ManagerMode = 'off' | 'auto' | 'manual'

/** Default fallback when no known model keyword matches. */
export const DEFAULT_FALLBACK = 'deepseek'

/** Persisted wordbook contents keyed by file name, e.g. `claude.md`. */
export type JailbreakStore = Record<string, string>

export const CONFIG_SCHEMA = z.object({
  mode: z.string().default('auto'),
  model: z.string().default(''),
  fallback: z.string().default(DEFAULT_FALLBACK),
  jailbreaks: z.dict(z.string()).default({}),
})

/** A model key is the lower-case `.md` file base name, e.g. `claude`. */
export type ModelKey = string

/** Built-in model keys shipped with the plugin. */
export const DEFAULT_MODEL_KEYS: readonly ModelKey[] = ['deepseek', 'claude', 'gemini', 'glm']

/** Matching precedence for built-ins; custom keys are checked after them. */
const MATCH_PRECEDENCE: readonly ModelKey[] = ['claude', 'gemini', 'glm', 'deepseek']

/**
 * Resolve the model family from an agent's provider/model route.
 * Matching is case-insensitive and keyword-based: if the combined route text
 * contains a known model key, that key wins. Unknown routes use `fallback`.
 */
export function modelKeyFromRoute(
  route: Partial<AgentOptions> | undefined,
  knownKeys: readonly ModelKey[],
  fallback: ModelKey,
): ModelKey {
  const text = `${route?.provider ?? ''} ${route?.model ?? ''}`.toLowerCase()
  const orderedKeys = [
    ...MATCH_PRECEDENCE.filter((key) => knownKeys.includes(key)),
    ...knownKeys.filter((key) => !MATCH_PRECEDENCE.includes(key)).sort(),
  ]
  for (const key of orderedKeys) {
    if (key !== '' && text.includes(key)) return key
  }
  if (knownKeys.includes(fallback)) return fallback
  return knownKeys[0] ?? DEFAULT_FALLBACK
}

/** Resolve the wordbook key from config + the active agent route. */
export function resolveModelKey(
  config: { mode: ManagerMode; model: string; fallback: ModelKey },
  route: Partial<AgentOptions> | undefined,
  knownKeys: readonly ModelKey[],
): ModelKey {
  if (config.mode === 'manual') {
    const manual = knownKeys.find((key) => key === config.model)
    if (manual !== undefined) return manual
  }
  return modelKeyFromRoute(route, knownKeys, config.fallback)
}

/** One jailbreak wordbook file entry exposed by the settings HTTP API. */
export interface JailbreakFileEntry {
  /** File name inside `jailbreaks/`, e.g. `claude.md`. */
  file: string
  /** Model family this file is conventionally mapped to. */
  model: string
  /** Full current markdown content. */
  content: string
}

/** Absolute path to the plugin's `jailbreaks/` directory. */
export const JAILBREAK_DIR = fileURLToPath(new URL('../jailbreaks/', import.meta.url))

/** List all wordbook model keys (lower-case file base names). */
export function listModelKeys(stored?: JailbreakStore): ModelKey[] {
  const fromDisk = readdirSync(JAILBREAK_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => basename(name, '.md').toLowerCase())
  const fromStore = stored !== undefined ? Object.keys(stored).map((name) => basename(name, '.md').toLowerCase()) : []
  return [...new Set([...fromDisk, ...fromStore])].sort()
}

/** Read the current wordbook file list, including contents. */
export function listJailbreaks(stored?: JailbreakStore): JailbreakFileEntry[] {
  return listModelKeys(stored).map((key) => {
    const file = `${key}.md`
    return {
      file,
      model: key,
      content: readJailbreak(file, stored),
    }
  })
}

/** Read one wordbook file by name. Persisted settings content wins. */
export function readJailbreak(file: string, stored?: JailbreakStore): string {
  const safe = safeFileName(file)
  if (stored !== undefined && typeof stored[safe] === 'string') return stored[safe]!
  try {
    return readFileSync(join(JAILBREAK_DIR, safe), 'utf8')
  } catch {
    return ''
  }
}

/**
 * Write one wordbook file by name. The file may already exist (edit) or be a
 * brand-new model added from the settings page.
 */
export function writeJailbreak(file: string, content: string): void {
  const safe = safeFileName(file)
  writeFileSync(join(JAILBREAK_DIR, safe), content, 'utf8')
}

/** Reject path traversal and non-md names before touching the filesystem. */
function safeFileName(file: string): string {
  const name = basename(file).toLowerCase()
  if (name !== file.toLowerCase() || !/^[a-z0-9_-]+\.md$/.test(name)) {
    throw new Error('invalid jailbreak file name')
  }
  return name
}

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

export const CONFIG_SCHEMA = z.object({
  mode: z.string().default('auto'),
  model: z.string().default(''),
})

/** The four supported model families. */
export type ModelKey = 'deepseek' | 'claude' | 'gemini' | 'glm'

/** Public model-family metadata shown in the settings UI. */
export const MODEL_KEYS: readonly ModelKey[] = ['deepseek', 'claude', 'gemini', 'glm']

/** File name for each model family. */
export const MODEL_FILES: Record<ModelKey, string> = {
  deepseek: 'deepseek.md',
  claude: 'claude.md',
  gemini: 'gemini.md',
  glm: 'glm.md',
}

/** Resolve the model family from an agent's provider/model route. */
export function modelKeyFromRoute(route?: Partial<AgentOptions>): ModelKey {
  const text = `${route?.provider ?? ''} ${route?.model ?? ''}`.toLowerCase()
  if (text.includes('claude')) return 'claude'
  if (text.includes('gemini')) return 'gemini'
  if (text.includes('glm')) return 'glm'
  return 'deepseek'
}

/** Resolve the wordbook key from config + the active agent route. */
export function resolveModelKey(
  config: { mode: ManagerMode; model: string },
  route?: Partial<AgentOptions>,
): ModelKey {
  if (config.mode === 'manual') {
    const manual = MODEL_KEYS.find((key) => key === config.model)
    if (manual !== undefined) return manual
  }
  return modelKeyFromRoute(route)
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

/** Read the current wordbook file list, including contents. */
export function listJailbreaks(): JailbreakFileEntry[] {
  const names = readdirSync(JAILBREAK_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
  return names.map((name) => ({
    file: name,
    model: modelKeyForFile(name),
    content: readFileSync(join(JAILBREAK_DIR, name), 'utf8'),
  }))
}

/** Read one wordbook file by name. A missing file yields an empty section. */
export function readJailbreak(file: string): string {
  const safe = safeFileName(file)
  try {
    return readFileSync(join(JAILBREAK_DIR, safe), 'utf8')
  } catch {
    return ''
  }
}

/** Write one wordbook file by name. The target must already exist. */
export function writeJailbreak(file: string, content: string): void {
  const safe = safeFileName(file)
  const target = join(JAILBREAK_DIR, safe)
  const existing = readdirSync(JAILBREAK_DIR)
  if (!existing.includes(safe)) {
    throw new Error(`unknown jailbreak file: ${safe}`)
  }
  writeFileSync(target, content, 'utf8')
}

/** Reject path traversal and non-md names before touching the filesystem. */
function safeFileName(file: string): string {
  const name = basename(file)
  if (name !== file || !/^[a-z0-9_-]+\.md$/i.test(name)) {
    throw new Error('invalid jailbreak file name')
  }
  return name
}

/** Best-effort model family for an arbitrary `.md` file name. */
function modelKeyForFile(file: string): string {
  const base = basename(file, '.md') as string
  return MODEL_KEYS.includes(base as ModelKey) ? base : base
}

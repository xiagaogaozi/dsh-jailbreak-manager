/**
 * 「破限词」settings page: choose automatic/manual model matching and edit
 * the plain `.md` jailbreak wordbook files. The page talks to the host
 * through same-origin HTTP routes; content is read from disk on every prompt
 * assembly, so saving here is immediately effective for the next request.
 *
 * Layout follows the official Setting-Cell convention and the DSH primitives
 * selector pattern (non-portal Menu, flex on Menu's root span, explicit left
 * alignment, `--dsw-*` tokens only).
 * @module dsh-jailbreak-manager/client/JailbreakManagerPage
 */

import { useEffect, useState } from 'react'
import {
  Button,
  Menu,
  IconChevronDownOutline14,
  IconDownloadOutline16,
  IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './JailbreakManagerPage.module.css'

/** Same-origin settings-page endpoints served by the host half. */
const CONFIG_ROUTE = '/plugins/dsh-jailbreak-manager/config'
const JAILBREAKS_ROUTE = '/plugins/dsh-jailbreak-manager/jailbreaks'

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Persisted model selection, mirrors the host config schema. */
interface ManagerConfig {
  mode: 'off' | 'auto' | 'manual'
  model: string
}

/** One wordbook file, mirrors the host JailbreakFileEntry. */
interface JailbreakFile {
  file: string
  model: string
  content: string
}

interface JailbreakList {
  files: JailbreakFile[]
}

const MODEL_OPTIONS = ['off', 'auto', 'deepseek', 'claude', 'gemini', 'glm'] as const
const MODEL_LABELS: Record<string, string> = {
  off: '关闭',
  auto: '自动',
  deepseek: 'DeepSeek',
  claude: 'Claude',
  gemini: 'Gemini',
  glm: 'GLM',
}

/** One pill selector: Menu + official chevron, in the Setting-Cell style. */
function ModelSelector({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const items = MODEL_OPTIONS.map((id) => ({ id, label: MODEL_LABELS[id] ?? id }))
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={items}
      selectedId={value}
      onSelect={(id) => { onChange(id); setOpen(false) }}
      align="end"
      className={css.selectorWrap}
      anchor={(
        <button
          type="button"
          className={css.selector}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => { setOpen(v => !v) }}
        >
          <span className={css.selectorText}>{MODEL_LABELS[value] ?? value}</span>
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      )}
    />
  )
}

export function JailbreakManagerPage(): JSX.Element {
  const [config, setConfig] = useState<ManagerConfig | null>(null)
  const [files, setFiles] = useState<JailbreakFile[]>([])
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    try {
      const [configValue, listValue] = await Promise.all([
        apiGet(CONFIG_ROUTE),
        apiGet(JAILBREAKS_ROUTE),
      ]) as [ManagerConfig, JailbreakList]
      setConfig(configValue)
      setFiles(listValue.files)
      if (listValue.files.length > 0) {
        const current = selected !== '' && listValue.files.some((f) => f.file === selected)
          ? selected
          : listValue.files[0]!.file
        setSelected(current)
        const found = listValue.files.find((f) => f.file === current)
        if (found !== undefined) setDraft(found.content)
      } else {
        setSelected('')
        setDraft('')
      }
      setError(null)
    } catch (err: unknown) {
      setError(`无法加载破限词配置：${err instanceof Error ? err.message : String(err)}（插件 host 可能未更新，请重启 DSH Desktop 后重试）`)
    }
  }

  // Fetch the host snapshot once when the settings section first mounts.
  // Without this effect the page stays on its loader forever.
  useEffect(() => {
    void load()
  }, [])

  const saveConfig = async (next: ManagerConfig): Promise<void> => {
    setConfig(next)
    setBusy(true)
    try {
      await apiPost(CONFIG_ROUTE, next)
      setError(null)
    } catch (err: unknown) {
      setError(`保存模型选择失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const onModelChange = (id: string): void => {
    const next: ManagerConfig = id === 'off'
      ? { mode: 'off', model: '' }
      : id === 'auto'
        ? { mode: 'auto', model: '' }
        : { mode: 'manual', model: id }
    void saveConfig(next)
  }

  const selectFile = (file: string): void => {
    setSelected(file)
    const found = files.find((f) => f.file === file)
    if (found !== undefined) setDraft(found.content)
    setSaved(false)
  }

  const saveJailbreak = async (): Promise<void> => {
    if (selected === '') return
    setBusy(true)
    try {
      await apiPost(JAILBREAKS_ROUTE, { file: selected, content: draft })
      setError(null)
      setSaved(true)
      setFiles((prev) => prev.map((f) => (f.file === selected ? { ...f, content: draft } : f)))
    } catch (err: unknown) {
      setError(`保存词库失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  if (config === null) {
    return (
      <div className={css.wrap}>
        {error !== null
          ? <div className={css.error}>{error}</div>
          : <div className={css.empty}>加载破限词管理器…</div>}
      </div>
    )
  }

  return (
    <div className={css.wrap}>
      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>模型匹配</div>
          <div className={css.desc}>关闭 = 不注入破限词；自动 = 跟随当前会话实际使用的 provider/model；手动 = 固定使用所选词库</div>
        </div>
        <ModelSelector
          value={config.mode === 'manual' ? config.model : config.mode}
          onChange={onModelChange}
          disabled={busy}
        />
      </div>

      <div className={css.sectionTitle}>词库文件</div>
      <div className={css.fileList}>
        {files.length === 0 && <div className={css.empty}>jailbreaks/ 目录下还没有 .md 词库文件。</div>}
        {files.map((f) => (
          <Button
            key={f.file}
            variant="ghost"
            size="sm"
            className={selected === f.file ? css.fileButtonActive : css.fileButton}
            onClick={() => selectFile(f.file)}
            disabled={busy}
          >{f.file}</Button>
        ))}
      </div>

      <div className={css.editorRow}>
        <textarea
          className={css.textarea}
          value={draft}
          placeholder={selected === '' ? '请先选择一个词库文件' : '在这里编辑破限词内容（纯 Markdown，保存后下次注入即生效）'}
          disabled={busy || selected === ''}
          onChange={(e) => { setDraft(e.target.value); setSaved(false) }}
          spellCheck={false}
        />
      </div>

      <div className={css.actionRow}>
        <Button
          variant="ghost"
          size="sm"
          icon={<IconRefreshOutline16 />}
          title="重新从磁盘载入词库内容"
          onClick={() => { void load() }}
          disabled={busy}
        >重新载入</Button>
        <Button
          variant="primary"
          size="sm"
          icon={<IconDownloadOutline16 />}
          title="保存当前词库文件"
          onClick={() => { void saveJailbreak() }}
          disabled={busy || selected === ''}
        >{saved ? '已保存' : '保存词库'}</Button>
      </div>

      {error !== null && <div className={css.error}>{error}</div>}
      <div className={css.hint}>
        词库为插件目录 jailbreaks/ 下的纯文本 md 文件，可直接编辑；保存后每次对话请求都会重新读取，无需重启 DSH Desktop。
      </div>
    </div>
  )
}

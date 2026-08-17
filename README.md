# dsh-jailbreak-manager

DSH Desktop 破限词管理器插件：在 deepseek / claude / gemini / glm 之间切换时，自动或手动注入对应的 jailbreak prompt，词库是插件目录下可直接编辑的 `.md` 文件。

## 功能

- **自动匹配**：读取当前会话 agent 实际使用的 provider/model，按模型名映射到 `jailbreaks/` 下的词库文件。
- **手动优先**：设置页选择 `手动 + 模型` 后固定使用该模型词库；选 `自动` 时跟随当前会话。
- **可编辑词库**：设置页可直接编辑 `jailbreaks/*.md`，保存后下次对话请求即重新读取，无需重启。
- **不修改 story 预设**：只通过 `systemPrompt.section` 注入，绝不改动 `agent.cordis.yml`。

## 安装（本地 tarball）

```sh
# 构建
node ./node_modules/typescript/bin/tsc -p tsconfig.json
node ./node_modules/typescript/bin/tsc -p tsconfig.client.json
node ./node_modules/tsdown/dist/run.mjs

# 打包
npm pack

# 复制到 DSH Desktop profile 的 local-plugins
# 并在 C:\Users\ASUS\.dsh\profiles\desktop\package.json 中：
#   dependencies: "dsh-jailbreak-manager": "file:local-plugins/dsh-jailbreak-manager/dsh-jailbreak-manager-0.1.2.tgz"
#   dsh.profile.bundles: 增加 "dsh-jailbreak-manager"
```

装完重启 DSH Desktop，硬刷新页面。

## 使用

1. 打开 设置 → **破限词**。
2. 模型匹配选择 `自动` 或某个固定模型。
3. 在词库文件列表选择 `deepseek.md` / `claude.md` / `gemini.md` / `glm.md`。
4. 编辑内容并保存；下次对话请求生效。

## 目录

```
dsh-jailbreak-manager/
├── jailbreaks/
│   ├── deepseek.md
│   ├── claude.md
│   ├── gemini.md
│   └── glm.md
├── src/
│   ├── index.ts          # host 插件主入口
│   └── jailbreak.ts      # 词库读取 / 模型映射
├── src/client/           # 设置页（DSH 原生 primitives）
├── cordis.patch.yml
└── package.json
```

## License

MIT

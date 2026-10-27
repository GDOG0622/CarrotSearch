# Extension-WebSearch

Add web search results to LLM prompts.

## 角色自主搜索

「角色自主搜索」与普通网页搜索独立，需要在 SillyTavern 的服务器上安装 **CarrotSearch 自己的服务端插件**。它不依赖胡萝卜本体的服务端插件。

先在 ST 的扩展管理中安装或更新 CarrotSearch，然后在酒馆服务器上，从 CarrotSearch 扩展目录执行（路径根据自己的安装位置调整）：

```bash
node plugin/install.cjs /root/SillyTavern
```

Windows 同样使用 `node plugin/install.cjs "酒馆根目录"`。安装脚本不会更改酒馆配置或其他插件；更新已有 CarrotSearch 后端时，会先在酒馆 `backups/carrotsearch` 下备份旧版。确认酒馆的 `config.yaml` 中 `enableServerPlugins: true`，然后重启酒馆服务。以后更新了 CarrotSearch 后端，也要重新执行安装脚本并重启，才能载入新版。

### 安卓 Termux 本地酒馆安装后端

如果 SillyTavern 是在安卓手机的 Termux 里运行的，后端也要安装在这台手机的酒馆目录里。先在酒馆扩展管理中安装或更新 CarrotSearch，再打开 Termux：

1. 停止正在运行的酒馆（在启动酒馆的 Termux 会话中按 `Ctrl+C`），然后进入自己的酒馆根目录。下面以常见的 `~/SillyTavern` 为例，实际目录不同就换成自己的路径：

   ```bash
   cd ~/SillyTavern
   ```

   可以用 `pwd` 查看当前路径；正确的根目录里应有 `server.js`、`config.yaml` 和 `public`。如果不确定目录，可在启动酒馆的会话中查看启动脚本所在位置。

2. 在酒馆根目录执行以下命令。这里使用当前目录作为酒馆路径；如果安装扩展时使用了不同的文件夹名称，先用 `ls public/scripts/extensions/third-party` 查看并调整路径：

   ```bash
   cd public/scripts/extensions/third-party/CarrotSearch
   node plugin/install.cjs "$(cd ../../../../.. && pwd)"
   ```

   安装脚本会下载所需依赖，需要联网；看到“CarrotSearch 后端已安装”表示安装脚本执行成功。如果提示找不到目录或 `server.js`，请核对酒馆和扩展的实际路径，不要照搬 VPS 的 `/root/SillyTavern`。

3. 确认酒馆根目录 `config.yaml` 中 `enableServerPlugins: true`。可以在 Termux 输入 `nano ~/SillyTavern/config.yaml` 编辑（路径按实际位置修改），保存使用 `Ctrl+O`、回车，退出使用 `Ctrl+X`。保持其他配置不变，然后用平时的方式重新启动酒馆。

4. 在 CarrotSearch 设置中配置「角色自主搜索」。SearXNG 地址应填写手机能够访问的服务地址：如果 SearXNG 部署在 VPS 上，`127.0.0.1` 指的是手机自身，不能填 VPS 的本地地址。定时自主搜索依赖 Termux 中的酒馆进程持续运行；手机休眠、省电或系统结束进程可能让它暂停。

以后通过扩展管理更新 CarrotSearch 后，如后端也有更新，重复第 1–3 步。安装脚本更新后端前会备份旧版，不会修改酒馆配置或其他插件。

在 CarrotSearch 设置中展开「角色自主搜索」，填写可编辑提示词；自主搜索自动使用当前酒馆用户、酒馆当前的 AI 连接和模型，以及上方选择的搜索来源与配置。当前 AI 连接支持自定义 OpenAI 兼容接口；搜索来源需要各自的服务或插件可用；为每个角色选择独立的已有世界书、检查间隔和触发方式。还需在 ST 中将该世界书绑定到角色，摘要才会在聊天中按关键词触发。服务器和 SearXNG 在同一台机器时，服务地址通常是 `http://127.0.0.1:8889`，端口以自己的实际部署为准。

后台判断不读取最近聊天：AI 根据角色人设、用户提示词、所选世界书中近期启用的条目和当前时间想象角色可能在做什么，决定是否因好奇、困惑或无聊搜索。真正搜到结果后会生成两条记录：默认关闭的详细搜索记录，以及绿灯关键词触发的摘要。摘要位置为系统、深度 1、顺序 0、触发概率 100%，勾选「不可递归」和「防止进一步递归」。搜索记录包含搜索来源返回的标题、链接和摘要；不能保证读取需要登录的内容。

「历史记录」面板显示在自主搜索设置下方，点击右上角角色头像切换已配置角色；它读取角色绑定世界书里的详细搜索条目，按日期列出其中的网页链接，点击后在新标签页打开。方案暂停后仍能查看历史；没有网页链接的结果不会显示为可点击记录。

「立即检查」仍由 AI 自己决定是否搜索；「查看运行状态」显示上次检查或错误。浏览器关闭后，只要 ST 服务进程运行且方案已启用，定时器会继续工作，并在服务重启后恢复。世界书编辑器打开时会跳过检查；后台更新后前端尝试刷新世界书缓存。不同设备同时编辑或浏览器挂起时，请先刷新世界书再保存，避免旧缓存覆盖新记录。每次检查会调用一次模型，实际搜索后还会调用一次模型生成摘要；模型需要支持 JSON 输出。

## 思考与工具过程

启用函数工具调用后，CarrotSearch 会尝试在 ST 原生思考框中按顺序展示相邻的思考和工具记录。搜索和访问网页会显示简洁卡片，可展开查看来源和截取的结果文本；其他工具使用通用卡片。思考和工具调用的原始记录仍由 ST 保存和处理，不会把展示内容写进提示词。

点击“查看原始记录 / 编辑思考”可切回 ST 原始消息，使用原生的思考复制、编辑和删除功能；再次点击可返回合并展示。只有消息能够按相邻记录关联且均已加载时才会合并，否则保留原始展示。搜索没有返回内容时会显示“未返回搜索结果”。展示效果取决于 ST 和模型是否提供相应思考及工具调用数据。

## Available sources

### Selenium Plugin

Requires an official server plugin to be installed and enabled.

See [SillyTavern-WebSearch-Selenium](https://github.com/SillyTavern/SillyTavern-WebSearch-Selenium) for more details.

Supports Google and DuckDuckGo engines.

### Extras API

Requires a `websearch` module and Chrome/Firefox web browser installed on the host machine.

Supports Google and DuckDuckGo engines.

### SerpApi

Requires SerpApi key and provides access to Google search.

Get the key here: <https://serpapi.com/dashboard>

### SearXNG

Requires a SearXNG instance URL (either private or public). Uses HTML format for search results.

SearXNG preferences string: obtained from SearXNG - preferences - COOKIES - Copy preferences hash

Learn more: <https://docs.searxng.org/>

### Tavily AI

Requires an API key.

Get the key here: <https://app.tavily.com/>

### KoboldCpp

KoboldCpp URL must be provided in Text Completion API settings. KoboldCpp version must be >= 1.81.1 and WebSearch module must be enabled on startup: enable Network => Enable WebSearch in the GUI launcher or add `--websearch` to the command line.

See: <https://github.com/LostRuins/koboldcpp/releases/tag/v1.81.1>

### Serper

Requires an API key.

Get the key here: <https://serper.dev/>

## Z.AI

Requires an API key. Not compatible with the Coding API subscription!

Get the key here: <https://z.ai/manage-apikey/apikey-list/>

Docs: <https://docs.z.ai/api-reference/tools/web-search>

## How to use

1. Make sure you use the latest version of SillyTavern (staging branch preferred).
2. Install the extension via the "Download Extensions & Assets" menu in SillyTavern.
3. Open the "Web Search" extension settings, set your API key, and enable the extension.
4. The web search results will be added to the prompt organically as you chat. **Only user messages trigger the search.**
5. To include search results more organically, wrap search queries with single backticks: ```Tell me about the `latest Ryan Gosling movie`.``` will produce a search query `latest Ryan Gosling movie`.
6. Optionally, configure the settings to your liking.

## Settings.

### General

1. Enabled - toggles the extension on and off.
2. Sources = sets the search results source.
3. Cache Lifetime - how long (in seconds) the search results are cached for your prompt. Default = one week.

### Prompt Settings

1. Prompt Budget - sets the maximum capacity of the inserted text (in characters of text, NOT tokens). Rule of thumb: 1 token ~ 3-4 characters, adjust according to your model's context limits. Default = 1500 characters.
2. Insertion Template - how the result gets inserted into the prompt. Supports the usual macro + special macro: `{{query}}` for search query and `{{text}}` for search results.
3. Injection Position - where the result goes in the prompt. The same options as for the Author's Note: as in-chat injection or before/after system prompt.

### Search Activation

1. Use Function Tool - uses [function calling](https://docs.sillytavern.app/for-contributors/function-calling/) to activate search or scrape web pages. Must use a supported Chat Completion API and be enabled in the AI Response settings. **Disables all other activation methods when engaged.**
2. Use Backticks - enables search activation using words encased in single backticks.
3. Use Trigger Phrases - enables search activation using trigger phrases.
4. Regular expressions - provide a JS-flavored regex to match the user message. If the regex matches, the search with a given query will be triggered. Search query supports `{{macros}}` and $1-syntax to reference the matched group. Example: `/what is happening in (.*)/i` regex for search query `news in $1` will match a message containing `what is happening in New York` and trigger the search with the query `news in New York`.
5. Trigger Phrases - add phrases that will trigger the search, one by one. It can be anywhere in the message, and the query starts from the trigger word and spans to "Max Words" total. To exclude a specific message from processing, it must start with a period, e.g. `.What do you think?`. Priority of triggers: first by order in the textbox, then the first one in the user message.
6. Max Words - how many words are included in the search query (including the trigger phrase). Google has a limit of about 32 words per prompt. Default = 10 words.

### Page Scraping

1. Visit Links - text will be extracted from the visited search result pages and saved to a file attachment.
2. Visit Count - how many links will be visited and parsed for text.
3. Visit Domain Blacklist - site domains to be excluded from visiting. One per line.
4. File Header - file header template, inserted at the start of the text file, has an additional `{{query}}` macro.
5. Block Header - link block template, inserted with the parsed content of every link. Use `{{link}}` macro for page URL and `{{text}}` for page content.
6. Save Target - where to save the results of scraping. Possible options: trigger message attachments, chat attachments of Data Bank (only on release >=1.12.0), or just images (if the source supports them).
7. Include Images - attach relevant images to the chat. Requires a source that supports images (see below).

## More info

Search results from the latest query will stay included in the prompt until the next valid query is found.
If you want to ask additional questions without accidentally triggering the search, start your message with a period.

Priority of triggers (if multiple are enabled):

1. Backticks.
2. Regular expressions.
3. Trigger phrases.

To discard all previous queries from processing, start the user message with an exclamation mark, for example, a user message `!Now let's talk about...` will discard this and every message above it.

This extension also provides a `/websearch` slash command to use in STscript. More info here: <https://docs.sillytavern.app/usage/st-script/>

```txt
/websearch (links=on|off snippets=on|off [query]) – performs a web search query. Use named arguments to specify what to return - page snippets (default: on) or full parsed pages (default: off) or both.

Example: /websearch links=off snippets=on how to make a sandwich
```

### What can be included in the search result?

**Thesaurus:**

- Answer box: Direct answer to the question.
- Knowledge graph: Encyclopedic knowledge about the topic.
- Page snippets: Relevant extracts from the web pages.
- Relevant questions: Questions and answers to similar topics.
- Images: Relevant images.

#### SerpApi

1. Answer box.
2. Knowledge graph.
3. Page snippets (max 10).
4. Relevant questions (max 10).
5. Images (max 10).

#### Selenium Plugin and Extras API

1. Google - answer box, knowledge graph, page snippets.
2. DuckDuckGo - page snippets.

**Selenium Plugin** can additionaly provide images.

#### SearXNG

1. Infobox.
2. Page snippets.
3. Images.

#### Tavily AI

1. Answer.
2. Page contents.
3. Images (up to 5).

#### KoboldCpp

1. Page titles.
2. Page snippets.

#### Serper

1. Answer box.
2. Knowledge graph.
3. Page snippets.
4. Relevant questions.
5. Images.

#### Z.AI

1. Page titles.
2. Page snippets.

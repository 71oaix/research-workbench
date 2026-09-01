---
title: 调研：AI/Agent 产品演示视频的制作经验与行业实践
status: active
created: 2026-09-01
updated: 2026-09-01
---

# 调研：AI/Agent 产品演示视频的制作经验与行业实践

> 背景：为"研镜"（科研文献调研智能体工作台，真实运行 + 录屏）录制研究生 AI 竞赛演示视频。本文通过网络检索调研近两年 AI 公司发布 demo、等待型产品拍摄、hackathon/开源/作品集惯例与 AI 辅助制作工具，结论均附来源。方法：web 检索通道当日不可用，改用系统级抓取 DuckDuckGo 结果 + 直接抓取一手文章（r.jina.ai 中转）。

## 一、AI/Agent demo 行业惯例

主流 AI 公司官宣 demo 的主流形态是**真实产品操作录屏 + 简明旁白/字幕**，而非精致动画。OpenAI 发布 Deep Research 时没有"特效宣传片"，而是官方博客 + 产品内真实运行画面：侧边栏实时列出"已执行步骤/所用来源"，任务需 5–30 分钟异步运行、完成后发通知（[openai.com](https://openai.com/index/introducing-deep-research/)）。Perplexity 等同类产品演示同样以浏览器真实操作片段为主；动效/动画版多出自设计师个人概念片（如 [Dribbble 上 60 秒动效拆解 Perplexity 的概念项目](https://dribbble.com/shots/26154416-Product-Launch-Videos-Perplexity)），公司官方不采用。

为何"真实操作 + 字幕"是惯例：① 录屏自带可信度，AI 产品卖点即"真实能力"，动画容易被质疑摆拍；② 字幕让评委可静音首看、跟上术语、跨语言传播（[sonix](https://sonix.ai/resources/add-subtitles-to-product-demos/)、[reccloud](https://reccloud.com/subtitles-for-screen-recordings.html) 均强调字幕对 demo 的加成，评委首看多为静音）；③ 制作成本低、可复用。行业普遍要求"脚本先行、2 分钟以内、先讲价值再讲细节"（[murf.ai](https://murf.ai/blog/how-to-create-a-product-demo-video-with-ai)、[moonb.io 对 13 个真实 demo 的时长分析](https://www.moonb.io/blog/software-demo-video)）。

## 二、"跑起来要等"的产品怎么拍

- **分段录制法（最推荐）**：录"点提交"→停止→等任务跑完→再录结果，剪掉中间等待。这是 hackathon 录制标准动作，原文："demo 读起来快，而不是虚假"（[recorded.app](https://recorded.app/en/blog/hackathon-demo-videos/)）。
- **录前预热**：先把慢接口/冷启动请求跑热，确保正式录制时第一个请求不是冷请求（同上）。
- **把"过程"当卖点展示**：Deep Research 用"步骤+来源"侧边栏替代空转 spinner，进度本身就是信任建立。研镜的"规划→检索→综述→引用核验"可视流水线同理：**保留 3–5 秒真实运行（步骤推进），其余等待剪掉或变速，并加字幕"已省略等待/×倍速"**（CapCut、VEED 变速即可实现）。
- 时间跳转用转场字幕（"× 分钟后……"）衔接，避免生硬切换。

## 三、竞赛/开源作品惯例

- **时长 ≤3 分钟**，常见 2 分钟模板：0–15s 说清问题 → 15–30s 方案 → 30–90s 真实运行演示（须占一半以上时长）→ 90–110s 一个技术亮点 → 110–120s 展望（[recorded.app](https://recorded.app/en/blog/hackathon-demo-videos/)；[Devpost 官方 6 Tips](https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video) 亦要求 <3 分钟并提供秒级分账脚本思路）。
- **前几秒必须是 pitch**，禁止"大家好我们很激动"式废话；必须 localhost 真实运行而非幻灯片（Devpost 明确 KISS、no slides）。
- 制作硬指标：好麦克风、窗口捕获（勿全屏露无关桌面）、关键 UI 放大、1080p/30fps/H.264 MP4、上传 YouTube 公开链接（避开"面向儿童"选项）、导出后完整自查一遍（recorded.app、Devpost）。
- 开源项目：README 内嵌"有声演示视频"能显著提升 star/贡献者，视频即完成度信号（[dev.to 指南](https://dev.to/custodiaadmin/how-to-add-a-narrated-demo-video-to-your-github-readme-1am1)）。优秀示例：[Temporal 的 Deep Research Agent 交互演示](https://www.youtube.com/watch?v=TEr8ZkZuNWw)（<3 分钟、结构化走查、旁白+字幕）。

## 四、作品集视角

单项目 1–3 分钟、内嵌于项目页；顺序为"运行中的成品 → 解决的问题 → 1 个关键架构决策 → GitHub 链接"，用真实数据佐证，避免技术栈罗列（[PortfolioVideo](https://portfoliovideo.com/blog/video-portfolio-for-software-developers)、[CareerFoundry](https://careerfoundry.com/en/blog/web-development/software-engineer-portfolio/)）。与竞赛视频相同：开头 hook、后半段才讲实现；评审全程可能只看一遍，故"演示主体 > 讲解"。

## 五、AI 辅助制作工具

- **脚本**：可用 LLM 起草，但必须用自己的话改写——Devpost 获奖者明确提醒 ChatGPT 初稿"太泛，讲不好你的项目"。（Devpost 6 Tips）
- **配音**：ElevenLabs（多语言、情感控制，[官方最佳实践](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)）、Murf（产品 demo 音色库）；但**真人旁白在 hackathon 评审中明显优于 AI 配音**（recorded.app），AI TTS 适合快速出多版脚本试听。
- **字幕**：CapCut/剪映免费 AI 自动字幕（可导出 SRT、修正错词与时间轴）（[capcut](https://www.capcut.com/resource/add-captions-with-ai)）；Sonix/RecCloud 备选。
- **剪辑**：OBS 录屏 + CapCut/剪映（变速、缩放、自动字幕）可覆盖全部需求，进阶 Premiere/Kdenlive/Descript（文本化剪辑）。完整工作流：脚本 → 分镜分段录制 → 合成变速 → 自动字幕 →（可选 TTS/真人旁白）→ 1080p 导出自查。

## 六、来源清单

- OpenAI：Introducing deep research（官方发布，含等待/进度侧边栏说明）：https://openai.com/index/introducing-deep-research/
- Devpost：6 Tips for Making a Winning Hackathon Demo Video：https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video
- hackathon.com：Creating the Best Demo Video for a Hackathon：https://tips.hackathon.com/article/creating-the-best-demo-video-for-a-hackathon-what-to-know
- recorded.app：How to Record a Winning Hackathon Demo Video：https://recorded.app/en/blog/hackathon-demo-videos/
- Murf AI：AI-Powered Product Demo Videos（脚本/配音工具链）：https://murf.ai/blog/how-to-create-a-product-demo-video-with-ai
- Moonb：13 Software Demo Videos That Sell（时长/风格）：https://www.moonb.io/blog/software-demo-video
- PortfolioVideo：Video Portfolios for Software Developers：https://portfoliovideo.com/blog/video-portfolio-for-software-developers
- CareerFoundry：The Complete Software Engineer Portfolio Guide：https://careerfoundry.com/en/blog/web-development/software-engineer-portfolio/
- dev.to：How to add a narrated demo video to your GitHub README：https://dev.to/custodiaadmin/how-to-add-a-narrated-demo-video-to-your-github-readme-1am1
- CapCut：Free Automatic Subtitles（AI 字幕）：https://www.capcut.com/resource/add-captions-with-ai
- ElevenLabs：TTS Best Practices（配音）：https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
- Sonix：How to Add Subtitles to Product Demos：https://sonix.ai/resources/add-subtitles-to-product-demos/
- Arcade：AI Demo Generator（录屏→旁白/标注/字幕）：https://www.arcade.software/post/ai-demo-generator
- Dribbble：Perplexity 60s 动效概念片（与真实录屏风格对比）：https://dribbble.com/shots/26154416-Product-Launch-Videos-Perplexity
- Temporal：Interactive Deep Research Agent demo（优秀示例）：https://www.youtube.com/watch?v=TEr8ZkZuNWw
---
title: 接入百炼 DashScope 兼容端点（千问 key + deepseek-v4-flash-0731）
status: archived
created: 2026-09-01
updated: 2026-09-02
kind: infra
priority: high
triage: actionable
areas: [server, docs]
---

# 接入百炼 DashScope 兼容端点（千问 key + deepseek-v4-flash-0731）

## 背景
用户 2026-09-01 实测反馈：多智能体模型调用从 DeepSeek 官方 API 切换到阿里云百炼
DashScope OpenAI 兼容端点（`https://dashscope.aliyuncs.com/compatible-mode/v1`），
key 用百炼工作空间 key（`sk-ws-` 开头），模型选 `deepseek-v4-flash-0731`（百炼
上架的 DeepSeek v4 Flash）。`.env.local` 已配好但真实调用静默失败（空回复）。

## 目标与结果
DEEPSEEK_BASE_URL 指向百炼兼容端点；同 key 携带旧凭据的问题、system 角色兼容问题
两处修复；探针 + 真实工作流端到端验证通过。

## 根因分析（两个独立问题，均为静默失败）
1. **system → developer 角色转换被 400 拒绝**：pi-ai `detectCompat` 里
   `isDeepSeek = provider === 'deepseek' || baseUrl 含 deepseek.com`。provider 名
   仍为 `deepseek` 而 baseUrl 指向百炼时，`supportsDeveloperRole` 判定为 true，
   pi 把 system 消息转成 `developer` 角色发送，百炼兼容端点不认该角色
   （`developer is not one of ['system','assistant','user','tool','function']`），
   HTTP 400 被 pi 吞成 `stopReason=error` 的空回复。
   → 修复：注册模型显式带 `compat.supportsDeveloperRole: false`，system 原样发送。
2. **auth.json 旧 key 优先于环境变量**：pi `AuthStorage.getApiKey` 优先级为
   `auth.json 存储凭据 > 环境变量`；本机 `~/.pi/agent/auth.json` 中残留旧的
   DeepSeek 官方 key（`sk-e8627…`），换百炼 key 后仍发旧 key，被百炼 401，
   同样静默成空回复（官方端点时代该 key 恰好有效，未暴露）。
   → 修复：`PiRuntimeProvider` 构造时 `authStorage.setRuntimeApiKey(provider, key)`
   （运行时覆盖、不落盘、优先级最高），确保始终使用 `DEEPSEEK_API_KEY` 配置值。

## 验证结果
- [x] 原始请求复刻：system 角色 / `thinking:{type:'disabled'}` /
      `reasoning_effort:'max'` / `max_completion_tokens` / `store:false` /
      `stream_options.include_usage` 全部被百炼兼容端点接受（HTTP 200）；
      仅 `developer` 角色被拒（HTTP 400）——与根因一致
- [x] 探针（PiRuntimeProvider 真实链路）：`PI_THINKING_LEVEL=off` 与 `xhigh`
      两档均真实返回文本，usage/cost 落库正常，xhigh 下 thinking 块流式正常
- [x] typecheck 全绿；server 全量 177 测试通过（+2 新回归用例：compat 断言、
      runtime key 覆盖断言；3 个 PiStepRunner 测试 mock 产物补足 50 字符）
- [x] 真实四步工作流端到端（planner → 审批 → researcher → writer → reviewer）
- [ ] 待办：`~/.pi/agent/auth.json` 中旧的 deepseek 凭据由运行时覆盖自动规避，
      无需手工清理（如需清理可自行删除该 provider 条目）

## 备注
- 成本表沿用 DeepSeek 官方非峰值价（input $0.22 / output $0.66 / cacheRead
  $0.007，USD/1M）：百炼侧单价未查到公开精确值，成本展示为估算；后续可校准。
- `PI_THINKING_LEVEL=off`（.env.local）可正常关闭思考展示；默认 xhigh 亦可
  （百炼接受 `reasoning_effort: max`）。

## 2026-09-02 官方 API 回迁（本文档转为历史记录）
用户决定不再使用百炼，回迁 DeepSeek 官方 API（key 换为官方 `sk-` 格式）：

- `.env.local` 回迁：`DEEPSEEK_BASE_URL=https://api.deepseek.com`、
  `PI_DEFAULT_MODEL=deepseek-v4-flash`；key 为官方 `sk-` 格式。
- 代码侧两处兼容修复（`compat.supportsDeveloperRole: false` 与
  `setRuntimeApiKey` 运行时覆盖）**与端点无关**，对官方同样生效且必要：
  官方端点同样要求 system 原样发送，同样存在 `~/.pi/agent/auth.json` 旧 key
  覆盖配置值的问题，故全部保留。
- 官方端点实测（2026-09-02 探针）：`deepseek-v4-flash` 正常流式返回
  （HTTP 200，usage 落库正常）；官方可用模型含
  `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-v4-flash-vision-exp`。
- 端点参数行为与兼容性说明以 runbook「M2-2 模型配置与验证」为准（已改为官方为主、
  百炼为可选）。
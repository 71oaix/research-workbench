# 效果评测数据（M2-15）

`queries.jsonl`：自建评测查询（宽泛 + 精确混合，部分带时间范围标注）。
`gold.jsonl`：手工标注的“金标论文”（标题级），用于 recall@20 计算。

用法：

```bash
npx tsx scripts/eval-m2-15.mjs --limit 5
npx tsx scripts/eval-m2-15.mjs --queries-file data/eval/queries.jsonl
```

LitSearch 子集：脚本支持 `--litsearch <jsonl>` 传入 LitSearch 查询子集
（字段 `query`），其 recall 判定依赖对应的相关论文集合（`relevant`），
未提供时只输出检索命中统计。

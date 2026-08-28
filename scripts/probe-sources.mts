// 检索源健康诊断：逐源试打一次
import { loadSearchConfig } from '../apps/server/src/search/config'
import { buildSourceRegistry } from '../apps/server/src/search/sources'
import { AcademicSearchService } from '../apps/server/src/search/AcademicSearchService'

const config = loadSearchConfig()
const service = new AcademicSearchService(buildSourceRegistry(config), config)
const result = await service.search('## 检索关键词\n- LLM hallucination detection', { compensate: false })
console.log('stats:', JSON.stringify(result.stats))
console.log('raw papers:', result.rawPapers.length)
process.exit(0)

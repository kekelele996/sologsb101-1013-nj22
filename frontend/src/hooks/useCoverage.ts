/**
 * useCoverage：按样带或站位汇总珊瑚覆盖率、白化占比与鱼类密度。
 * 被珊瑚计数页（/belts/:id/corals）、鱼类计数页（/belts/:id/fishes）
 * 与覆盖度汇总页（/coverage）消费。
 */
import { computed, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useReefStore } from '@/stores/reefStore'
import { useBeltStore } from '@/stores/beltStore'
import { useSurveyStore } from '@/stores/surveyStore'
import type { BleachLevel, CoralRecord, CoralForm } from '@/types/coralRecord'
import { BLEACH_LEVELS } from '@/types/coralRecord'
import type { FishCount } from '@/types/fishCount'
import {
  bleachGrade,
  bleachIndex,
  bleachedSharePct,
  combineEffective,
  fishDensity,
  round,
  summarizeCorals
} from '@/utils/bleach'

/** 单条样带的覆盖度成果 */
export interface BeltCoverage {
  beltId: string
  beltNo: string
  siteId: string
  siteNo: string
  reefId: string
  reefName: string
  lengthM: number
  orientation: string
  surveyDate: string
  observer: string
  coralCount: number
  /** 去重后的属名 + 形态组数 */
  groupCount: number
  coverCmTotal: number
  /** 珊瑚覆盖率（%，封顶后 ≤ 100） */
  coveragePct: number
  /** 有效覆盖合计超出样带长度被截掉的长度（cm） */
  truncatedCm: number
  /** 白化指数 0 ~ 4 */
  bleachIndex: number
  grade: BleachLevel
  /** 白化占比（%） */
  bleachedSharePct: number
  /** 各白化等级有效覆盖长度 */
  distribution: Record<BleachLevel, number>
  /** 按属名分组的有效覆盖长度 */
  byGenus: Array<{ genus: string; coverCm: number; recordCount: number; bleachIndex: number; grade: BleachLevel }>
  /** 按形态分组的有效覆盖长度 */
  byForm: Array<{ form: CoralForm; coverCm: number; recordCount: number }>
  fishTotal: number
  invertebrateTotal: number
  /** 鱼类密度（尾 / 100 m²） */
  fishDensity: number
}

/** 单个站位的覆盖度汇总 */
export interface SiteCoverage {
  siteId: string
  siteNo: string
  reefId: string
  reefName: string
  depthM: number
  beltCount: number
  coralCount: number
  coverCmTotal: number
  /** 站位平均覆盖率（各样本带覆盖率均值） */
  avgCoveragePct: number
  avgBleachIndex: number
  grade: BleachLevel
  bleachedSharePct: number
  fishTotal: number
  invertebrateTotal: number
  fishDensity: number
}

/** 按白化等级排序的珊瑚记录行（珊瑚计数页表格用） */
export interface CoralRow {
  record: CoralRecord
  /** 占样带长度比例（%） */
  coverSharePct: number
}

export interface UseCoverageResult {
  /** 指定样带的覆盖度成果 */
  beltCoverage: (beltId: string | null | undefined) => ComputedRef<BeltCoverage | null>
  /** 指定站位下全部样带的汇总 */
  siteCoverage: (siteId: string | null | undefined) => ComputedRef<SiteCoverage | null>
  /** 全部样带的覆盖度成果（按白化指数降序） */
  allBeltCoverages: ComputedRef<BeltCoverage[]>
  /** 全部站位的覆盖度汇总 */
  allSiteCoverages: ComputedRef<SiteCoverage[]>
  /** 全局白化等级分布 */
  globalDistribution: ComputedRef<Record<BleachLevel, number>>
  /** 指定样带的珊瑚记录行（按白化等级降序） */
  coralRows: (beltId: string | null | undefined) => ComputedRef<CoralRow[]>
  /** 指定样带的鱼类计数行 */
  fishRows: (beltId: string | null | undefined) => ComputedRef<Array<{ record: FishCount; density: number }>>
}

/** 白化等级排序权重（用于珊瑚记录行排序） */
const BLEACH_WEIGHT_ORDER: Record<BleachLevel, number> = {
  无: 0,
  轻: 1,
  中: 2,
  重: 3,
  死亡: 4
}

const EMPTY_DISTRIBUTION = (): Record<BleachLevel, number> => ({ 无: 0, 轻: 0, 中: 0, 重: 0, 死亡: 0 })

/**
 * 组合式函数：基于三个 store 的响应式列表派生覆盖度、白化占比与鱼类密度。
 */
export function useCoverage(): UseCoverageResult {
  const reefStore = useReefStore()
  const beltStore = useBeltStore()
  const surveyStore = useSurveyStore()

  const { reefs, sites } = storeToRefs(reefStore)
  const { belts } = storeToRefs(beltStore)
  const { corals, fishes } = storeToRefs(surveyStore)

  const siteOf = (siteId: string) => sites.value.find((site) => site.id === siteId) ?? null
  const reefOf = (reefId: string) => reefs.value.find((reef) => reef.id === reefId) ?? null

  function buildBeltCoverage(beltId: string): BeltCoverage | null {
    const belt = belts.value.find((item) => item.id === beltId)
    if (!belt) return null
    const site = siteOf(belt.siteId)
    const reef = site ? reefOf(site.reefId) : null
    const beltCorals = corals.value.filter((coral) => coral.beltId === belt.id)
    const beltFishes = fishes.value.filter((fish) => fish.beltId === belt.id)
    const summary = summarizeCorals(beltCorals, belt.lengthM)
    const fishTotal = beltFishes.filter((fish) => fish.category === '鱼类').reduce((sum, fish) => sum + fish.count, 0)
    const invertebrateTotal = beltFishes
      .filter((fish) => fish.category === '无脊椎动物')
      .reduce((sum, fish) => sum + fish.count, 0)
    return {
      beltId: belt.id,
      beltNo: belt.no,
      siteId: site?.id ?? '',
      siteNo: site?.no ?? '—',
      reefId: reef?.id ?? '',
      reefName: reef?.name ?? '未知礁区',
      lengthM: belt.lengthM,
      orientation: belt.orientation,
      surveyDate: belt.surveyDate,
      observer: belt.observer,
      coralCount: summary.rawRecordCount,
      groupCount: summary.groupCount,
      coverCmTotal: summary.effectiveCoverCm,
      coveragePct: summary.coveragePct,
      truncatedCm: summary.truncatedCm,
      bleachIndex: summary.bleachIndex,
      grade: summary.grade,
      bleachedSharePct: summary.bleachedSharePct,
      distribution: summary.distribution,
      byGenus: summary.byGenus,
      byForm: summary.byForm,
      fishTotal,
      invertebrateTotal,
      fishDensity: fishDensity(fishTotal, belt.lengthM)
    }
  }

  function beltCoverage(beltId: string | null | undefined): ComputedRef<BeltCoverage | null> {
    return computed(() => (beltId ? buildBeltCoverage(beltId) : null))
  }

  const allBeltCoverages = computed<BeltCoverage[]>(() =>
    belts.value
      .map((belt) => buildBeltCoverage(belt.id))
      .filter((item): item is BeltCoverage => item !== null)
      .sort((a, b) => b.bleachIndex - a.bleachIndex)
  )

  function buildSiteCoverage(siteId: string): SiteCoverage | null {
    const site = siteOf(siteId)
    if (!site) return null
    const reef = reefOf(site.reefId)
    const siteBelts = belts.value.filter((belt) => belt.siteId === site.id)
    const siteFishes = fishes.value.filter((fish) => siteBelts.some((belt) => belt.id === fish.beltId))
    // 样带内按属名 + 形态去重，跨样带不去重；覆盖率封顶只在单条样带口径上做
    const beltSummaries = siteBelts.map((belt) =>
      summarizeCorals(
        corals.value.filter((coral) => coral.beltId === belt.id),
        belt.lengthM
      )
    )
    const effective = combineEffective(beltSummaries.map((summary) => summary.effective))
    const coverCmTotal = round(
      effective.reduce((sum, coral) => sum + coral.coverCm, 0),
      1
    )
    const avgCoveragePct =
      beltSummaries.length === 0
        ? 0
        : round(beltSummaries.reduce((sum, summary) => sum + summary.coveragePct, 0) / beltSummaries.length, 2)
    const avgBleachIndex =
      beltSummaries.length === 0
        ? 0
        : round(beltSummaries.reduce((sum, summary) => sum + summary.bleachIndex, 0) / beltSummaries.length, 2)
    const fishTotal = siteFishes.filter((fish) => fish.category === '鱼类').reduce((sum, fish) => sum + fish.count, 0)
    const totalBeltLength = siteBelts.reduce((sum, belt) => sum + belt.lengthM, 0)
    return {
      siteId: site.id,
      siteNo: site.no,
      reefId: reef?.id ?? '',
      reefName: reef?.name ?? '未知礁区',
      depthM: site.depthM,
      beltCount: siteBelts.length,
      coralCount: effective.length,
      coverCmTotal,
      avgCoveragePct,
      avgBleachIndex,
      grade: bleachGrade(avgBleachIndex),
      bleachedSharePct: bleachedSharePct(effective),
      fishTotal,
      invertebrateTotal: siteFishes
        .filter((fish) => fish.category === '无脊椎动物')
        .reduce((sum, fish) => sum + fish.count, 0),
      fishDensity: fishDensity(fishTotal, totalBeltLength)
    }
  }

  function siteCoverage(siteId: string | null | undefined): ComputedRef<SiteCoverage | null> {
    return computed(() => (siteId ? buildSiteCoverage(siteId) : null))
  }

  const allSiteCoverages = computed<SiteCoverage[]>(() =>
    sites.value
      .map((site) => buildSiteCoverage(site.id))
      .filter((item): item is SiteCoverage => item !== null)
      .sort((a, b) => b.avgBleachIndex - a.avgBleachIndex)
  )

  const globalDistribution = computed<Record<BleachLevel, number>>(() => {
    const distribution = EMPTY_DISTRIBUTION()
    BLEACH_LEVELS.forEach((level) => {
      distribution[level] = round(
        corals.value.filter((coral) => coral.bleachLevel === level).reduce((sum, coral) => sum + coral.coverCm, 0),
        1
      )
    })
    return distribution
  })

  function coralRows(beltId: string | null | undefined): ComputedRef<CoralRow[]> {
    return computed(() => {
      if (!beltId) return []
      const belt = belts.value.find((item) => item.id === beltId)
      const beltLengthCm = belt ? belt.lengthM * 100 : 0
      return corals.value
        .filter((coral) => coral.beltId === beltId)
        .map((record) => ({
          record,
          coverSharePct: beltLengthCm > 0 ? round((record.coverCm / beltLengthCm) * 100, 1) : 0
        }))
        .sort((a, b) => {
          const weightDiff =
            BLEACH_WEIGHT_ORDER[b.record.bleachLevel] - BLEACH_WEIGHT_ORDER[a.record.bleachLevel]
          if (weightDiff !== 0) return weightDiff
          return b.record.coverCm - a.record.coverCm
        })
    })
  }

  function fishRows(beltId: string | null | undefined): ComputedRef<Array<{ record: FishCount; density: number }>> {
    return computed(() => {
      if (!beltId) return []
      const belt = belts.value.find((item) => item.id === beltId)
      const lengthM = belt?.lengthM ?? 0
      return fishes.value
        .filter((fish) => fish.beltId === beltId)
        .map((record) => ({ record, density: fishDensity(record.count, lengthM) }))
        .sort((a, b) => b.record.count - a.record.count)
    })
  }

  return {
    beltCoverage,
    siteCoverage,
    allBeltCoverages,
    allSiteCoverages,
    globalDistribution,
    coralRows,
    fishRows
  }
}

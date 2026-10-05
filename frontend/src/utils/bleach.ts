/**
 * 白化工具：白化等级排序权重、白化指数换算与配色映射。
 * 另含「有效覆盖」口径：同一样带内同「属名 + 形态」的重复录入折叠为一条
 * （覆盖取组内最长、白化等级取组内最重），合计超样带长度封顶。
 * 页面、store 与数据库播种共用同一套算法。
 */
import type { BleachLevel, CoralForm } from '@/types/coralRecord'
import { BLEACH_LEVELS } from '@/types/coralRecord'

/** 保留小数位 */
export function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 白化等级权重：无 0、轻 1、中 2、重 3、死亡 4 */
export const BLEACH_WEIGHT: Record<BleachLevel, number> = {
  无: 0,
  轻: 1,
  中: 2,
  重: 3,
  死亡: 4
}

/** 白化等级配色 */
export const BLEACH_COLOR: Record<BleachLevel, string> = {
  无: '#1e8449',
  轻: '#7ab648',
  中: '#d68910',
  重: '#e07b39',
  死亡: '#7b241c'
}

/** 白化等级浅色底 */
export const BLEACH_BG: Record<BleachLevel, string> = {
  无: '#eaf6ee',
  轻: '#f0f7e8',
  中: '#fdf3e3',
  重: '#fdeee4',
  死亡: '#f6e4e2'
}

/** 白化等级图标（Element Plus 图标组件名） */
export const BLEACH_ICON: Record<BleachLevel, string> = {
  无: 'CircleCheckFilled',
  轻: 'InfoFilled',
  中: 'WarningFilled',
  重: 'Warning',
  死亡: 'CircleCloseFilled'
}

/** 白化等级排序权重：重者优先 */
export function compareBleach(a: BleachLevel, b: BleachLevel, coverA = 0, coverB = 0): number {
  const diff = BLEACH_WEIGHT[b] - BLEACH_WEIGHT[a]
  if (diff !== 0) return diff
  return coverB - coverA
}

/** 珊瑚形态配色（用于覆盖率图表） */
export const FORM_COLOR: Record<CoralForm, string> = {
  枝状: '#0b5d5a',
  块状: '#3f9ec4',
  叶状: '#7ab648',
  软珊瑚: '#d68910'
}

/**
 * 白化指数：按覆盖长度加权的平均白化等级（0 ~ 4）。
 * 传入每条记录的覆盖长度与白化等级，返回加权平均并保留 2 位小数。
 */
export function bleachIndex(records: Array<{ coverCm: number; bleachLevel: BleachLevel }>): number {
  const totalCover = records.reduce((sum, record) => sum + Math.max(0, record.coverCm), 0)
  if (totalCover <= 0) return 0
  const weighted = records.reduce(
    (sum, record) => sum + Math.max(0, record.coverCm) * BLEACH_WEIGHT[record.bleachLevel],
    0
  )
  return round(weighted / totalCover, 2)
}

/** 白化等级定级：由白化指数换算成礁区总体等级（参考珊瑚白化分级习惯） */
export function bleachGrade(index: number): BleachLevel {
  if (index <= 0.05) return '无'
  if (index <= 1) return '轻'
  if (index <= 2) return '中'
  if (index <= 3) return '重'
  return '死亡'
}

/**
 * 珊瑚覆盖率（%）：样带内珊瑚覆盖长度合计 / 样带长度 × 100。
 * 样带长度以米传入，覆盖长度以厘米累计。
 */
export function coralCoveragePct(coverCmTotal: number, beltLengthM: number): number {
  const beltLengthCm = beltLengthM * 100
  if (beltLengthCm <= 0) return 0
  return round((coverCmTotal / beltLengthCm) * 100, 2)
}

/** 白化占比（%）：白化等级非「无」的覆盖长度占珊瑚总覆盖长度的比例 */
export function bleachedSharePct(records: Array<{ coverCm: number; bleachLevel: BleachLevel }>): number {
  const totalCover = records.reduce((sum, record) => sum + Math.max(0, record.coverCm), 0)
  if (totalCover <= 0) return 0
  const bleached = records
    .filter((record) => record.bleachLevel !== '无')
    .reduce((sum, record) => sum + Math.max(0, record.coverCm), 0)
  return round((bleached / totalCover) * 100, 1)
}

/** 鱼类密度（尾 / 100 m²）：计数 / （样带长度 × 1 m 宽）× 100 */
export function fishDensity(count: number, beltLengthM: number, beltWidthM = 1): number {
  const area = beltLengthM * beltWidthM
  if (area <= 0) return 0
  return round((count / area) * 100, 2)
}

/** 按属名分组汇总覆盖长度 */
export function groupByGenus(
  records: Array<{ genus: string; coverCm: number }>
): Array<{ genus: string; coverCm: number }> {
  const map = new Map<string, number>()
  records.forEach((record) => {
    map.set(record.genus, (map.get(record.genus) ?? 0) + record.coverCm)
  })
  return Array.from(map.entries())
    .map(([genus, coverCm]) => ({ genus, coverCm: round(coverCm, 1) }))
    .sort((a, b) => b.coverCm - a.coverCm)
}

/** 按形态分组汇总覆盖长度 */
export function groupByForm(
  records: Array<{ form: CoralForm; coverCm: number }>
): Array<{ form: CoralForm; coverCm: number }> {
  const map = new Map<CoralForm, number>()
  records.forEach((record) => {
    map.set(record.form, (map.get(record.form) ?? 0) + record.coverCm)
  })
  return Array.from(map.entries())
    .map(([form, coverCm]) => ({ form, coverCm: round(coverCm, 1) }))
    .sort((a, b) => b.coverCm - a.coverCm)
}

/* ------------------------------ 有效覆盖口径 ------------------------------ */

/**
 * 有效珊瑚组：同一样带内「属名 + 形态」相同的多条记录折叠为一条。
 * 覆盖长度取组内最长那条，白化等级取组内最重那条（不取平均）。
 */
export interface EffectiveCoralGroup {
  genus: string
  form: CoralForm
  /** 有效覆盖长度（cm）：组内最长那条的覆盖长度 */
  coverCm: number
  /** 有效白化等级：组内最重那条的等级 */
  bleachLevel: BleachLevel
  /** 组内原始记录条数 */
  recordCount: number
  /** 组内被合并掉的覆盖长度（cm）：组内合计 − 有效覆盖 */
  mergedCoverCm: number
}

/**
 * 按「属名 + 形态」折叠同一样带内的重复录入：
 * 一组里覆盖长度取最长那条，白化等级取最重那条。
 */
export function effectiveCorals(
  records: Array<{ genus: string; form: CoralForm; coverCm: number; bleachLevel: BleachLevel }>
): EffectiveCoralGroup[] {
  const map = new Map<string, EffectiveCoralGroup & { totalCoverCm: number }>()
  records.forEach((record) => {
    const key = `${record.genus}::${record.form}`
    const coverCm = Math.max(0, record.coverCm)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        genus: record.genus,
        form: record.form,
        coverCm,
        bleachLevel: record.bleachLevel,
        recordCount: 1,
        mergedCoverCm: 0,
        totalCoverCm: coverCm
      })
      return
    }
    existing.recordCount += 1
    existing.totalCoverCm += coverCm
    existing.coverCm = Math.max(existing.coverCm, coverCm)
    if (BLEACH_WEIGHT[record.bleachLevel] > BLEACH_WEIGHT[existing.bleachLevel]) {
      existing.bleachLevel = record.bleachLevel
    }
  })
  return Array.from(map.values()).map(({ totalCoverCm, ...group }) => ({
    ...group,
    coverCm: round(group.coverCm, 1),
    mergedCoverCm: round(totalCoverCm - group.coverCm, 1)
  }))
}

/**
 * 跨样带折叠：先按样带分组，再在每条样带内按「属名 + 形态」取有效覆盖，
 * 返回全部样带的有效记录合集（站位 / 礁区 / 全局汇总用）。
 */
export function effectiveCoralsByBelt(
  records: Array<{ beltId: string; genus: string; form: CoralForm; coverCm: number; bleachLevel: BleachLevel }>
): EffectiveCoralGroup[] {
  const byBelt = new Map<string, typeof records>()
  records.forEach((record) => {
    const list = byBelt.get(record.beltId) ?? []
    list.push(record)
    byBelt.set(record.beltId, list)
  })
  return Array.from(byBelt.values()).flatMap((list) => effectiveCorals(list))
}

/** 单条样带的珊瑚覆盖汇总（有效覆盖口径） */
export interface BeltCoralSummary {
  /** 有效记录（按「属名 + 形态」折叠后） */
  effective: EffectiveCoralGroup[]
  /** 原始录入合计（cm，未去重） */
  rawCoverCmTotal: number
  /** 有效覆盖合计（cm，去重后、未封顶） */
  effectiveCoverCmTotal: number
  /** 覆盖合计（cm）：有效合计按样带长度封顶 */
  coverCmTotal: number
  /** 同组重复录入被合并掉的长度（cm） */
  mergedCoverCm: number
  /** 超过样带长度被截掉的长度（cm） */
  cappedTrimmedCm: number
  /** 被截掉总量（cm）= 重复合并 + 超样带截掉 */
  trimmedCoverCm: number
  /** 珊瑚覆盖率（%）：封顶后合计 / 样带长度，不超过 100 */
  coveragePct: number
  /** 白化指数 0 ~ 4：有效记录按覆盖长度加权 */
  bleachIndex: number
  /** 白化占比（%）：有效记录中白化等级非「无」的覆盖占比 */
  bleachedSharePct: number
  /** 有效记录的白化等级分布（cm） */
  distribution: Record<BleachLevel, number>
}

/**
 * 单条样带的覆盖汇总口径：
 * 1. 同「属名 + 形态」重复录入只取有效覆盖（最长那条的覆盖、最重那条的等级）；
 * 2. 有效合计超过样带长度时封顶，截掉部分单独给出；
 * 3. 覆盖率、白化指数、白化占比各算各的，但都基于有效记录。
 */
export function summarizeBeltCorals(
  records: Array<{ genus: string; form: CoralForm; coverCm: number; bleachLevel: BleachLevel }>,
  beltLengthM: number
): BeltCoralSummary {
  const effective = effectiveCorals(records)
  const rawCoverCmTotal = round(
    records.reduce((sum, record) => sum + Math.max(0, record.coverCm), 0),
    1
  )
  const effectiveCoverCmTotal = round(
    effective.reduce((sum, group) => sum + group.coverCm, 0),
    1
  )
  const beltLengthCm = beltLengthM * 100
  const coverCmTotal =
    beltLengthCm > 0 ? round(Math.min(effectiveCoverCmTotal, beltLengthCm), 1) : effectiveCoverCmTotal
  const mergedCoverCm = round(rawCoverCmTotal - effectiveCoverCmTotal, 1)
  const cappedTrimmedCm = round(effectiveCoverCmTotal - coverCmTotal, 1)
  const distribution: Record<BleachLevel, number> = { 无: 0, 轻: 0, 中: 0, 重: 0, 死亡: 0 }
  BLEACH_LEVELS.forEach((level) => {
    distribution[level] = round(
      effective
        .filter((group) => group.bleachLevel === level)
        .reduce((sum, group) => sum + group.coverCm, 0),
      1
    )
  })
  return {
    effective,
    rawCoverCmTotal,
    effectiveCoverCmTotal,
    coverCmTotal,
    mergedCoverCm,
    cappedTrimmedCm,
    trimmedCoverCm: round(rawCoverCmTotal - coverCmTotal, 1),
    coveragePct: coralCoveragePct(coverCmTotal, beltLengthM),
    bleachIndex: bleachIndex(effective),
    bleachedSharePct: bleachedSharePct(effective),
    distribution
  }
}

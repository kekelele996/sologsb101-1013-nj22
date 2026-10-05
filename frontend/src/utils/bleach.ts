/**
 * 白化工具：白化等级排序权重、白化指数换算与配色映射。
 * 页面、store 与数据库播种共用同一套算法。
 */
import type { BleachLevel, CoralForm, CoralRecord } from '@/types/coralRecord'
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

/**
 * 去重后的有效珊瑚记录：同一条样带内「属名 + 形态」相同的记录合并为一条。
 * 覆盖长度取组内最长一条，白化等级取组内最重一条（不平均）。
 */
export interface EffectiveCoral {
  genus: string
  form: CoralForm
  /** 有效覆盖长度（cm，组内最长） */
  coverCm: number
  /** 白化等级（组内最重） */
  bleachLevel: BleachLevel
  /** 合并的原始记录条数 */
  recordCount: number
}

/** 属名 + 形态 分组键（JSON 序列化，避免属名中的特殊字符造成串组） */
function coralGroupKey(genus: string, form: CoralForm): string {
  return JSON.stringify([genus, form])
}

/**
 * 样带内按「属名 + 形态」分组去重：每组取覆盖长度最长的一条，白化等级取最重的一条。
 * 注意去重口径为同一条样带内；跨样带的同名属形态不属于重复，不应合并。
 */
export function effectiveCorals(
  records: Array<Pick<CoralRecord, 'genus' | 'form' | 'coverCm' | 'bleachLevel'>>
): EffectiveCoral[] {
  interface Bucket extends EffectiveCoral {
    maxWeight: number
  }
  const map = new Map<string, Bucket>()
  records.forEach((record) => {
    const cover = Math.max(0, record.coverCm)
    const key = coralGroupKey(record.genus, record.form)
    const bucket = map.get(key)
    if (!bucket) {
      map.set(key, {
        genus: record.genus,
        form: record.form,
        coverCm: cover,
        bleachLevel: record.bleachLevel,
        recordCount: 1,
        maxWeight: BLEACH_WEIGHT[record.bleachLevel]
      })
      return
    }
    bucket.recordCount += 1
    if (cover > bucket.coverCm) bucket.coverCm = cover
    const weight = BLEACH_WEIGHT[record.bleachLevel]
    if (weight > bucket.maxWeight) {
      bucket.maxWeight = weight
      bucket.bleachLevel = record.bleachLevel
    }
  })
  return Array.from(map.values())
    .map((bucket) => ({
      genus: bucket.genus,
      form: bucket.form,
      coverCm: round(bucket.coverCm, 1),
      bleachLevel: bucket.bleachLevel,
      recordCount: bucket.recordCount
    }))
    .sort((a, b) => b.coverCm - a.coverCm)
}

/** 单条样带的珊瑚覆盖与白化汇总（去重 + 封顶后的有效口径） */
export interface CoralSummary {
  /** 按属名 + 形态去重后的有效记录 */
  effective: EffectiveCoral[]
  /** 原始记录条数 */
  rawRecordCount: number
  /** 去重后的属名 + 形态组数 */
  groupCount: number
  /** 有效覆盖长度合计（cm，未封顶） */
  effectiveCoverCm: number
  /** 封顶后可计入的覆盖长度（cm） */
  countedCoverCm: number
  /** 被截掉的覆盖长度（cm）= 有效合计 - 封顶计入 */
  truncatedCm: number
  /** 珊瑚覆盖率（%，封顶后 ≤ 100） */
  coveragePct: number
  /** 白化指数（按有效覆盖长度加权，0 ~ 4） */
  bleachIndex: number
  /** 总体白化等级 */
  grade: BleachLevel
  /** 白化占比（%） */
  bleachedSharePct: number
  /** 各白化等级有效覆盖长度（cm） */
  distribution: Record<BleachLevel, number>
  /** 按属名分组的有效覆盖长度 */
  byGenus: Array<{ genus: string; coverCm: number; recordCount: number; bleachIndex: number; grade: BleachLevel }>
  /** 按形态分组的有效覆盖长度 */
  byForm: Array<{ form: CoralForm; coverCm: number; recordCount: number }>
}

/**
 * 单条样带的珊瑚汇总：先按属名 + 形态去重取有效覆盖，再算覆盖率、白化指数与白化占比；
 * 有效覆盖合计超过样带长度时封顶，超出部分记入 truncatedCm。
 */
export function summarizeCorals(
  records: Array<Pick<CoralRecord, 'genus' | 'form' | 'coverCm' | 'bleachLevel'>>,
  beltLengthM: number
): CoralSummary {
  const effective = effectiveCorals(records)
  const rawRecordCount = records.length
  const groupCount = effective.length
  const effectiveCoverCm = round(effective.reduce((sum, item) => sum + item.coverCm, 0), 1)
  const beltLengthCm = beltLengthM * 100
  const countedCoverCm = round(Math.min(effectiveCoverCm, beltLengthCm), 1)
  const truncatedCm = round(effectiveCoverCm - countedCoverCm, 1)
  const coveragePct = coralCoveragePct(countedCoverCm, beltLengthM)
  const index = bleachIndex(effective)
  const distribution: Record<BleachLevel, number> = { 无: 0, 轻: 0, 中: 0, 重: 0, 死亡: 0 }
  BLEACH_LEVELS.forEach((level) => {
    distribution[level] = round(
      effective.filter((item) => item.bleachLevel === level).reduce((sum, item) => sum + item.coverCm, 0),
      1
    )
  })
  const genusMap = new Map<string, EffectiveCoral[]>()
  effective.forEach((item) => {
    const list = genusMap.get(item.genus) ?? []
    list.push(item)
    genusMap.set(item.genus, list)
  })
  const byGenus = Array.from(genusMap.entries())
    .map(([genus, list]) => {
      const coverCm = round(list.reduce((sum, item) => sum + item.coverCm, 0), 1)
      const recordCount = list.reduce((sum, item) => sum + item.recordCount, 0)
      const groupIndex = bleachIndex(list)
      return { genus, coverCm, recordCount, bleachIndex: groupIndex, grade: bleachGrade(groupIndex) }
    })
    .sort((a, b) => b.coverCm - a.coverCm)
  const formMap = new Map<CoralForm, EffectiveCoral[]>()
  effective.forEach((item) => {
    const list = formMap.get(item.form) ?? []
    list.push(item)
    formMap.set(item.form, list)
  })
  const byForm = Array.from(formMap.entries())
    .map(([form, list]) => ({
      form,
      coverCm: round(list.reduce((sum, item) => sum + item.coverCm, 0), 1),
      recordCount: list.reduce((sum, item) => sum + item.recordCount, 0)
    }))
    .sort((a, b) => b.coverCm - a.coverCm)
  return {
    effective,
    rawRecordCount,
    groupCount,
    effectiveCoverCm,
    countedCoverCm,
    truncatedCm,
    coveragePct,
    bleachIndex: index,
    grade: bleachGrade(index),
    bleachedSharePct: bleachedSharePct(effective),
    distribution,
    byGenus,
    byForm
  }
}

/**
 * 合并多条样带的有效珊瑚记录：样带内按属名 + 形态去重，跨样带不去重。
 * 用于站位 / 礁区 / 全局等跨样带汇总（覆盖率封顶只在单条样带口径上做）。
 */
export function combineEffective(
  beltRecords: Array<Array<Pick<CoralRecord, 'genus' | 'form' | 'coverCm' | 'bleachLevel'>>>
): EffectiveCoral[] {
  return beltRecords.flatMap((records) => effectiveCorals(records))
}

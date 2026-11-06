import * as HugeiconsData from '@hugeicons/core-free-icons'
import * as LucideData from 'lucide'
import { ICONS as RuneIconsData, type IconEntry as RunePackageEntry } from 'runeicons'
import { RUNE_STYLES, type RuneIconStyle } from './web-icon-style'
import {
  createWebElement,
  type WebNode,
} from './web-model'
import type { IconLibrary } from './web-icon-style'

export { iconInfo, iconStyleOperation, isIconNode, RUNE_STYLES } from './web-icon-style'
export type { IconLibrary, IconStyle, RuneIconStyle } from './web-icon-style'

export const ICON_LIBRARIES = [
  { id: 'hugeicons', label: 'Hugeicons' },
  { id: 'lucide', label: 'Lucide' },
  { id: 'runeicons', label: 'RuneIcons' },
] as const satisfies readonly { id: IconLibrary; label: string }[]

export const DEFAULT_RUNE_STYLE: RuneIconStyle = 'outline'

type IconTuple = readonly [string, Readonly<Record<string, string | number>>]

/** One parsed shape with its children, so masks and filters keep their tree. */
interface ShapeNode {
  tag: string
  attrs: Record<string, string>
  children: ShapeNode[]
}

interface IconEntry {
  name: string
  data: readonly ShapeNode[]
  viewBox: string
  root: Readonly<Record<string, string>>
  /** Set for RuneIcons; the vector libraries share one drawing. */
  style: RuneIconStyle | null
}

export interface IconMatch {
  library: IconLibrary
  name: string
  /** Set for RuneIcons; insert with the same style to get this drawing. */
  style?: RuneIconStyle
}

export interface IconOptions {
  parentId: string | null
  order: number
  /** Rendered width and height in px. */
  size?: number
  /** Any CSS color; icons draw with `currentColor`, so this sets the svg's `color`. */
  color?: string
  strokeWidth?: number
  /** RuneIcons collection; ignored by the other libraries. */
  style?: RuneIconStyle
  /**
   * Place the icon at this point of its parent, free-positioned, so it can be
   * moved and resized. Without both, it sits in the parent's flow.
   */
  left?: number
  top?: number
}

const DEFAULT_STROKE: Record<IconLibrary, number> = { hugeicons: 1.5, lucide: 2, runeicons: 2 }
const DEFAULT_VIEWBOX = '0 0 24 24'
const libraries: Record<Exclude<IconLibrary, 'runeicons'>, Record<string, unknown>> = {
  hugeicons: HugeiconsData,
  lucide: LucideData,
}
const indexes = new Map<string, Map<string, IconEntry>>()

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

function isIconData(value: unknown): value is readonly IconTuple[] {
  return Array.isArray(value) && value.length > 0 && value.every(
    (item) =>
      Array.isArray(item)
      && typeof item[0] === 'string'
      && typeof item[1] === 'object'
      && item[1] !== null,
  )
}

const SHAPE_TAGS = new Set([
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'use',
  'g', 'defs', 'mask', 'filter', 'linearGradient', 'radialGradient', 'stop',
])

/** Filter primitives (`feGaussianBlur`, `feFlood`, …) travel with their filter. */
function isShapeTag(tag: string): boolean {
  return SHAPE_TAGS.has(tag) || (tag.startsWith('fe') && tag.length > 2 && tag[2] === tag[2]?.toUpperCase())
}

const TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9]*)((?:"[^"]*"|[^">])*)(\/?)>/g
const ATTR_PATTERN = /([A-Za-z:-]+)="([^"]*)"/g

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  ATTR_PATTERN.lastIndex = 0
  for (const match of source.matchAll(ATTR_PATTERN)) {
    if (match[1] && match[2] !== undefined && match[1] !== 'key') attrs[match[1]] = match[2]
  }
  return attrs
}

/**
 * RuneIcons ships SVG markup strings, not shape tuples. Parse them into the
 * same tree the tuples become, keeping nested groups (masks, filters) so the
 * glass collection renders as drawn. Unknown tags are skipped but their
 * children are kept, so a future tag never eats a drawing.
 */
function parseMarkup(markup: string): ShapeNode[] {
  const roots: ShapeNode[] = []
  const stack: ShapeNode[] = []
  TAG_PATTERN.lastIndex = 0
  for (const match of markup.matchAll(TAG_PATTERN)) {
    const closing = match[0].startsWith('</')
    const tag = match[1]!
    if (!isShapeTag(tag)) continue
    if (closing) {
      while (stack.length > 0 && stack[stack.length - 1]!.tag !== tag) stack.pop()
      stack.pop()
      continue
    }
    const node: ShapeNode = { tag, attrs: parseAttrs(match[2] ?? ''), children: [] }
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
    if (!match[0].endsWith('/>')) stack.push(node)
  }
  return roots
}

function tupleShapes(data: readonly IconTuple[]): ShapeNode[] {
  return data.map(([tag, props]) => ({
    tag,
    attrs: Object.fromEntries(
      Object.entries(props)
        .filter(([name]) => name !== 'key' && name !== 'strokeWidth')
        .map(([name, value]) => [kebab(name), String(value)]),
    ),
    children: [],
  }))
}

function runeStyleOf(icon: RunePackageEntry, style: RuneIconStyle): RuneIconStyle {
  const wanted = RUNE_STYLES.find((entry) => entry.id === style)
  if (wanted && icon.variants[wanted.type]) return style
  for (const entry of RUNE_STYLES) {
    if (icon.variants[entry.type]) return entry.id
  }
  return DEFAULT_RUNE_STYLE
}

function runeRoot(style: RuneIconStyle): Record<string, string> {
  // Pixel shapes carry their own fill and no stroke; a root stroke would
  // fringe every pixel. The stroke collections inherit it from the root.
  if (style === 'pixel') return { fill: 'none' }
  return { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
}

const VECTOR_ROOT: Record<string, string> = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}

function buildRuneIndex(style: RuneIconStyle): Map<string, IconEntry> {
  const index = new Map<string, IconEntry>()
  for (const icon of RuneIconsData) {
    const effective = runeStyleOf(icon, style)
    const type = RUNE_STYLES.find((entry) => entry.id === effective)!.type
    const variant = icon.variants[type]
    if (!variant) continue
    index.set(`${normalize(icon.name)}::${effective}`, {
      name: icon.name,
      data: parseMarkup(variant.markup),
      viewBox: variant.viewBox || DEFAULT_VIEWBOX,
      root: runeRoot(effective),
      style: effective,
    })
  }
  return index
}

function buildVectorIndex(library: Exclude<IconLibrary, 'runeicons'>): Map<string, IconEntry> {
  const index = new Map<string, IconEntry>()
  for (const [exportName, data] of Object.entries(libraries[library])) {
    if (!isIconData(data)) continue
    const name = exportName.replace(/FreeIcons$/, '').replace(/Icon$/, '')
    if (!name) continue
    const key = normalize(name)
    if (!index.has(key)) {
      index.set(key, { name, data: tupleShapes(data), viewBox: DEFAULT_VIEWBOX, root: VECTOR_ROOT, style: null })
    }
  }
  return index
}

function iconIndex(library: IconLibrary, style?: RuneIconStyle): Map<string, IconEntry> {
  const key = library === 'runeicons' ? `runeicons::${style ?? DEFAULT_RUNE_STYLE}` : library
  const cached = indexes.get(key)
  if (cached) return cached
  const index = library === 'runeicons'
    ? buildRuneIndex(style ?? DEFAULT_RUNE_STYLE)
    : buildVectorIndex(library)
  indexes.set(key, index)
  return index
}

/** Names containing the query, shortest first; an empty query lists the library alphabetically. */
export function searchIcons(
  query: string,
  library?: IconLibrary,
  limit = 60,
  style?: RuneIconStyle,
): IconMatch[] {
  const needle = normalize(query)
  const matches: IconMatch[] = []
  for (const id of library ? [library] : ICON_LIBRARIES.map((entry) => entry.id)) {
    for (const [key, entry] of iconIndex(id, style)) {
      const name = id === 'runeicons' ? key.slice(0, key.lastIndexOf('::')) : key
      if (!name.includes(needle)) continue
      matches.push(entry.style ? { library: id, name: entry.name, style: entry.style } : { library: id, name: entry.name })
    }
  }
  return matches
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export function iconCount(library: IconLibrary) {
  return iconIndex(library).size
}

/** Path data for previews; the same tree the inserted svg is built from. */
export function iconData(library: IconLibrary, name: string, style?: RuneIconStyle) {
  const index = iconIndex(library, style)
  if (library === 'runeicons') {
    return index.get(`${normalize(name)}::${style ?? DEFAULT_RUNE_STYLE}`) ?? null
  }
  return index.get(normalize(name)) ?? null
}

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

function emitShapes(shapes: readonly ShapeNode[], parentId: string, orderBase: number): WebNode[] {
  const nodes: WebNode[] = []
  shapes.forEach((shape, index) => {
    const node = createWebElement(shape.tag, {
      parentId,
      order: orderBase + (index + 1) * 1_024,
      namespace: 'svg',
      attributes: shape.attrs,
    })
    nodes.push(node, ...emitShapes(shape.children, node.id, 0))
  })
  return nodes
}

/** The svg plus one child per shape, ready for `node.insert` in that order. */
export function iconNodes(
  library: IconLibrary,
  requestedName: string,
  options: IconOptions,
): WebNode[] | null {
  const entry = iconData(library, requestedName, options.style)
  if (!entry) return null
  const size = options.size ?? 24
  const svg = createWebElement('svg', {
    namespace: 'svg',
    parentId: options.parentId,
    order: options.order,
    attributes: {
      viewBox: entry.viewBox,
      ...entry.root,
      'stroke-width': String(options.strokeWidth ?? DEFAULT_STROKE[library]),
      'aria-label': entry.name,
      'data-icon-library': library,
      'data-icon-name': entry.name,
      ...(entry.style ? { 'data-icon-style': entry.style } : {}),
    },
    styles: {
      ...(options.left !== undefined && options.top !== undefined
        ? { position: 'absolute', left: `${options.left}px`, top: `${options.top}px` }
        : {}),
      width: `${size}px`,
      height: `${size}px`,
      ...(options.color ? { color: options.color } : {}),
    },
  })
  return [svg, ...emitShapes(entry.data, svg.id, 0)]
}

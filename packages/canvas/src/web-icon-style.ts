import type { WebElementNode, WebNode, WebOperation } from './web-model'

export type IconLibrary = 'hugeicons' | 'lucide' | 'runeicons'

/**
 * The RuneIcons collections: one glyph drawn five ways. The picker labels
 * them by mood; `type` is the key the runeicons package files them under.
 */
export const RUNE_STYLES = [
  { id: 'outline', type: 'normal', label: 'Outline' },
  { id: 'duotone', type: 'duotone', label: 'Duotone' },
  { id: 'fill', type: 'fill', label: 'Fill' },
  { id: 'pixel', type: 'pixelated', label: 'Pixel' },
  { id: 'glass', type: 'glass', label: 'Glass' },
] as const

export type RuneIconStyle = (typeof RUNE_STYLES)[number]['id']

export interface IconStyle {
  color?: string
  size?: number
  strokeWidth?: number
}

export function isIconNode(node: WebNode | null | undefined): node is WebElementNode {
  return node?.kind === 'element' && node.tag === 'svg' && node.attributes['data-icon-name'] !== undefined
}

export function iconInfo(node: WebNode | null | undefined) {
  if (!isIconNode(node)) return null
  const library = node.attributes['data-icon-library']
  return {
    library: library === 'lucide' ? 'lucide' : library === 'runeicons' ? 'runeicons' : 'hugeicons',
    name: node.attributes['data-icon-name'] ?? '',
  } satisfies { library: IconLibrary; name: string }
}

/** One `node.patch` restyling an icon; `null` when nothing was asked for. */
export function iconStyleOperation(id: string, style: IconStyle): WebOperation | null {
  const styles: Record<string, string> = {}
  const attributes: Record<string, string> = {}
  if (style.color !== undefined) styles.color = style.color
  if (style.size !== undefined) {
    styles.width = `${style.size}px`
    styles.height = `${style.size}px`
  }
  if (style.strokeWidth !== undefined) attributes['stroke-width'] = String(style.strokeWidth)
  if (!Object.keys(styles).length && !Object.keys(attributes).length) return null
  return {
    type: 'node.patch',
    id,
    patch: {
      kind: 'element',
      ...(Object.keys(styles).length ? { styles } : {}),
      ...(Object.keys(attributes).length ? { attributes } : {}),
    },
  }
}

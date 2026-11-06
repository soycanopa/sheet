import { describe, expect, test } from 'vitest'
import {
  ICON_LIBRARIES,
  RUNE_STYLES,
  iconData,
  iconInfo,
  iconNodes,
  iconStyleOperation,
  isIconNode,
  searchIcons,
} from './web-icons'
import {
  applyWebTransaction,
  createWebDocument,
  createWebElement,
} from './web-model'

function withIcon(library: 'lucide' | 'hugeicons', name: string) {
  const root = createWebElement('main', { parentId: null })
  const base = { ...createWebDocument('t'), roots: [root.id], nodes: { [root.id]: root } }
  const nodes = iconNodes(library, name, { parentId: root.id, order: 1_024, color: '#ff0000' })
  if (!nodes) throw new Error('icon missing')
  const result = applyWebTransaction(base, {
    id: 'tx-1',
    label: 'Insert icon',
    operations: nodes.map((node) => ({ type: 'node.insert' as const, node })),
  })
  return { document: result.document, svg: nodes[0], count: nodes.length }
}

describe('web icons', () => {
  test('searches every supported library', () => {
    expect(ICON_LIBRARIES.map((entry) => entry.id)).toEqual(['hugeicons', 'lucide', 'runeicons'])
    expect(RUNE_STYLES.map((entry) => entry.id)).toEqual(['outline', 'duotone', 'fill', 'pixel', 'glass'])
    expect(searchIcons('heart', 'lucide').every((icon) => icon.library === 'lucide')).toBe(true)
    const libraries = new Set(searchIcons('heart').map((icon) => icon.library))
    expect(libraries).toEqual(new Set(['hugeicons', 'lucide', 'runeicons']))
  })

  test('rune icons carry their collection and viewBox', () => {
    const [match] = searchIcons('arrow down', 'runeicons', 5)
    expect(match?.library).toBe('runeicons')
    expect(match?.name).toBe('Arrow Down')
    expect(match?.style).toBe('outline')
    const outline = iconNodes('runeicons', 'Arrow Down', { parentId: null, order: 1 })
    const pixel = iconNodes('runeicons', 'Arrow Down', { parentId: null, order: 1, style: 'pixel' })
    expect(outline?.[0]?.kind === 'element' && outline[0].attributes['viewBox']).toBe('0 0 24 24')
    expect(pixel?.[0]?.kind === 'element' && pixel[0].attributes['viewBox']).toBe('0 0 40 41')
    expect(pixel?.[0]?.kind === 'element' && pixel[0].attributes['data-icon-style']).toBe('pixel')
    expect(iconInfo(outline?.[0])?.library).toBe('runeicons')
  })

  test('rune icons fall back to an available collection', () => {
    // Archive 1 ships glass only, so the outline default resolves to glass…
    const match = searchIcons('archive 1', 'runeicons', 20).find((icon) => icon.name === 'Archive 1')
    expect(match?.style).toBe('glass')
    // …and the glass tree keeps its nested mask groups.
    const entry = iconData('runeicons', match?.name ?? '', 'glass')
    const masks = (entry?.data ?? []).filter((shape) => shape.tag === 'mask' || shape.tag === 'g')
    expect(masks.length).toBeGreaterThan(0)
    expect(iconNodes('runeicons', 'definitely-not-an-icon', { parentId: null, order: 1 })).toBeNull()
  })

  test('returns null for an unknown icon', () => {
    expect(iconNodes('lucide', 'definitely-not-an-icon', { parentId: null, order: 1 })).toBeNull()
  })

  test.each(['lucide', 'hugeicons'] as const)('%s icons insert through a real transaction', (library) => {
    const { document, svg, count } = withIcon(library, 'heart')
    expect(count).toBeGreaterThan(1)
    const inserted = document.nodes[svg?.id ?? '']
    expect(isIconNode(inserted)).toBe(true)
    expect(iconInfo(inserted)?.library).toBe(library)
    expect(inserted?.kind === 'element' && inserted.styles.color).toBe('#ff0000')
  })

  test('style operation recolors, resizes and re-strokes in one patch', () => {
    const { document, svg } = withIcon('lucide', 'heart')
    const operation = iconStyleOperation(svg?.id ?? '', { color: '#00ff00', size: 40, strokeWidth: 3 })
    expect(operation).not.toBeNull()
    if (!operation) return
    const next = applyWebTransaction(document, { id: 'tx-2', label: 'Style icon', operations: [operation] })
    const node = next.document.nodes[svg?.id ?? '']
    expect(node?.kind === 'element' && node.styles).toMatchObject({ color: '#00ff00', width: '40px', height: '40px' })
    expect(node?.kind === 'element' && node.attributes['stroke-width']).toBe('3')
    expect(iconStyleOperation('x', {})).toBeNull()
  })
})

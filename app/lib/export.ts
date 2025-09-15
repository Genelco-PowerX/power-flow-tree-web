import type { TreeData } from '@/lib/types'

type Visibility = {
  showS1Upstream: boolean
  showS2Upstream: boolean
  showDownstream: boolean
}

function splitLabel(label: any): string[] {
  if (typeof label === 'string') return label.split('\n')
  return [String(label ?? '')]
}

export async function exportTreeToPng(
  treeData: TreeData,
  visibility: Visibility,
  fileName: string
): Promise<void> {
  const visibleNodeIds = new Set<string>()
  visibleNodeIds.add(treeData.selectedEquipment.id)

  treeData.upstream.forEach((eq) => {
    const branch = (eq as any).branch || 'S1'
    if ((branch === 'S1' && visibility.showS1Upstream) || (branch === 'S2' && visibility.showS2Upstream)) {
      visibleNodeIds.add(eq.id)
    }
  })
  if (visibility.showDownstream) treeData.downstream.forEach((eq) => visibleNodeIds.add(eq.id))

  const nodes = treeData.nodes.filter((n) => visibleNodeIds.has(n.id))
  const edges = treeData.edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
  if (nodes.length === 0) throw new Error('Nothing to export')

  const dims = nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: Number((n.style as any)?.width || 180),
    h: Number((n.style as any)?.height || 70),
  }))
  let minX = Math.min(...dims.map((d) => d.x))
  let minY = Math.min(...dims.map((d) => d.y))
  let maxX = Math.max(...dims.map((d) => d.x + d.w))
  let maxY = Math.max(...dims.map((d) => d.y + d.h))
  const PAD = 40
  minX -= PAD
  minY -= PAD
  maxX += PAD
  maxY += PAD
  const width = Math.ceil(maxX - minX)
  const height = Math.ceil(maxY - minY)

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const svg: string[] = []
  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#ffffff">`
  )

  // Edges
  edges.forEach((e) => {
    const s = nodeById.get(e.source)
    const t = nodeById.get(e.target)
    if (!s || !t) return
    const sw = Number((s.style as any)?.width || 180)
    const sh = Number((s.style as any)?.height || 70)
    const tw = Number((t.style as any)?.width || 180)
    const th = Number((t.style as any)?.height || 70)
    const sx = s.position.x + sw / 2 - minX
    const sy = s.position.y + sh - minY
    const tx = t.position.x + tw / 2 - minX
    const ty = t.position.y - minY
    const midY = (sy + ty) / 2
    const stroke = (e.style as any)?.stroke || '#1f2937'
    const dashVal = (e.style as any)?.strokeDasharray as string | undefined
    svg.push(
      `<path d="M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}" fill="none" stroke="${stroke}" stroke-width="2" ${
        dashVal ? `stroke-dasharray="${dashVal.replace(/,/g, ' ')}"` : ''
      } />`
    )
    const label = (e as any).label as string | undefined
    if (label) {
      const lx = (sx + tx) / 2
      const ly = midY - 6
      svg.push(`<rect x="${lx - 10}" y="${ly - 8}" width="20" height="16" rx="6" ry="6" fill="#ffffff" stroke="#e5e7eb" />`)
      svg.push(
        `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif" font-size="11" font-weight="600" fill="#0f172a">${label}</text>`
      )
    }
  })

  // Nodes
  nodes.forEach((n) => {
    const w = Number((n.style as any)?.width || 180)
    const h = Number((n.style as any)?.height || 70)
    const x = n.position.x - minX
    const y = n.position.y - minY
    const fill = (n.style as any)?.background || '#2563eb'
    const color = (n.style as any)?.color || '#ffffff'
    const border = (n.style as any)?.border as string | undefined
    let stroke = 'none'
    let strokeWidth = 0
    let strokeDasharray = ''
    if (border && border !== 'none') {
      const m = border.match(/(\d+)px\s+(dashed|solid)\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/)
      if (m) {
        strokeWidth = Number(m[1])
        stroke = m[3]
        strokeDasharray = m[2] === 'dashed' ? '6 4' : ''
      }
    }
    svg.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${
        strokeDasharray ? `stroke-dasharray="${strokeDasharray}"` : ''
      } />`
    )
    const lines = splitLabel(n.data?.label)
    const lineHeight = 14
    const total = lines.length * lineHeight
    let ty = y + h / 2 - total / 2 + 10
    lines.forEach((line) => {
      svg.push(
        `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif" font-size="11" font-weight="600" fill="${color}">${
          line.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        }</text>`
      )
      ty += lineHeight
    })
  })

  svg.push('</svg>')
  const svgStr = svg.join('')
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.download = `${fileName}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
      resolve()
    }
    img.onerror = reject
    img.src = url
  })
}


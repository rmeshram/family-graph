'use client'

import { useMemo } from 'react'

interface NodePosition {
  id: string
  x: number
  y: number
}

interface Viewport {
  pan: { x: number; y: number }
  zoom: number
  width: number
  height: number
}

/**
 * useViewportCulling — returns only node IDs visible in the current viewport.
 *
 * The family tree applies: screenX = worldX * zoom + pan.x
 * A node is visible if its screen position falls within:
 *   [-margin, width + margin] × [-margin, height + margin]
 *
 * This keeps DOM node count at ~20–50 regardless of total graph size.
 * The margin (default 200px) pre-renders just-off-screen nodes to prevent
 * pop-in when panning.
 *
 * NOTE: nodePositions are in world space (the coordinate system of the
 * transformed canvas). The canvas origin (0,0) maps to screen position
 * (pan.x + width/2 * (1 - zoom?)), but we actually use center-origin
 * transform, so the mapping is:
 *
 *   screenX = worldX * zoom + pan.x + (containerWidth / 2) * (1 - zoom) ... 
 *
 * Actually looking at the family-tree.tsx, the transform is:
 *   transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
 *   transformOrigin: 'center center'
 *
 * With transformOrigin: 'center center', the effective screen position of a
 * world point (wx, wy) is:
 *   screenX = (wx - containerWidth/2) * zoom + containerWidth/2 + pan.x
 *   screenY = (wy - containerHeight/2) * zoom + containerHeight/2 + pan.y
 *
 * A node is culled when screenX + nodeRadius < -margin OR
 *                        screenX - nodeRadius > width + margin
 * (same for Y)
 */
export function useViewportCulling(
  nodePositions: NodePosition[],
  viewport: Viewport,
  margin = 200,
): Set<string> {
  return useMemo(() => {
    const { pan, zoom, width, height } = viewport
    const cx = width / 2
    const cy = height / 2
    const nodeHalfW = 80  // generous half-width to avoid clipping wide nodes
    const nodeHalfH = 80

    const visible = new Set<string>()

    for (const pos of nodePositions) {
      // World → screen (transformOrigin: '0 0')
      // screenX = worldX * zoom + pan.x
      const screenX = pos.x * zoom + pan.x
      const screenY = pos.y * zoom + pan.y

      if (
        screenX + nodeHalfW * zoom >= -margin &&
        screenX - nodeHalfW * zoom <= width + margin &&
        screenY + nodeHalfH * zoom >= -margin &&
        screenY - nodeHalfH * zoom <= height + margin
      ) {
        visible.add(pos.id)
      }
    }

    return visible
  }, [nodePositions, viewport, margin])
}

/**
 * isEdgeVisible — true if at least one endpoint of an edge is in the
 * expanded viewport (margin * 2). Used to cull SVG connection lines.
 */
export function isEdgeVisible(
  fromPos: NodePosition,
  toPos: NodePosition,
  viewport: Viewport,
  margin = 400,
): boolean {
  const { pan, zoom, width, height } = viewport
  const cx = width / 2
  const cy = height / 2

  const inView = (pos: NodePosition) => {
    const sx = (pos.x - cx) * zoom + cx + pan.x
    const sy = (pos.y - cy) * zoom + cy + pan.y
    return (
      sx >= -margin && sx <= width + margin &&
      sy >= -margin && sy <= height + margin
    )
  }

  return inView(fromPos) || inView(toPos)
}

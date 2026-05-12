'use client'

import { useEffect, useRef, useCallback, memo } from 'react'

interface Star {
  x: number
  y: number
  radius: number
  baseOpacity: number
  phase: number      // phase offset for twinkle
  speed: number      // twinkle speed
  depth: number      // 1=slow/far, 2=mid, 3=fast/close
  color: string
}

const STAR_COLORS_DARK = ['#ffffff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#93c5fd']
const STAR_COLORS_LIGHT = ['#94a3b8', '#64748b', '#6366f1', '#818cf8', '#475569']
const STAR_COUNT = 130

function createStars(w: number, h: number, isLight: boolean): Star[] {
  const colors = isLight ? STAR_COLORS_LIGHT : STAR_COLORS_DARK
  return Array.from({ length: STAR_COUNT }, () => {
    const depth = Math.ceil(Math.random() * 3) as 1 | 2 | 3
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      radius: depth === 1 ? 0.3 + Math.random() * 0.4
        : depth === 2 ? 0.6 + Math.random() * 0.5
          : 0.9 + Math.random() * 0.7,
      baseOpacity: isLight
        ? (depth === 1 ? 0.06 + Math.random() * 0.08 : depth === 2 ? 0.10 + Math.random() * 0.12 : 0.15 + Math.random() * 0.12)
        : (depth === 1 ? 0.12 + Math.random() * 0.18 : depth === 2 ? 0.22 + Math.random() * 0.22 : 0.35 + Math.random() * 0.25),
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
      depth,
      color: colors[Math.floor(Math.random() * colors.length)],
    }
  })
}

function drawNebulae(ctx: CanvasRenderingContext2D, w: number, h: number, isLight: boolean) {
  const opacity = isLight ? 0.4 : 1.0  // lighter nebulae in light mode

  // Top-left purple nebula
  const g1 = ctx.createRadialGradient(w * 0.15, h * 0.2, 0, w * 0.15, h * 0.2, w * 0.45)
  g1.addColorStop(0, `rgba(99,102,241,${0.09 * opacity})`)
  g1.addColorStop(0.5, `rgba(99,102,241,${0.04 * opacity})`)
  g1.addColorStop(1, 'transparent')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, w, h)

  // Bottom-right violet nebula
  const g2 = ctx.createRadialGradient(w * 0.85, h * 0.8, 0, w * 0.85, h * 0.8, w * 0.5)
  g2.addColorStop(0, `rgba(139,92,246,${0.07 * opacity})`)
  g2.addColorStop(0.5, `rgba(139,92,246,${0.03 * opacity})`)
  g2.addColorStop(1, 'transparent')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, w, h)

  // Center-top faint cyan (skip in light mode for cleanliness)
  if (!isLight) {
    const g3 = ctx.createRadialGradient(w * 0.55, h * 0.1, 0, w * 0.55, h * 0.1, w * 0.3)
    g3.addColorStop(0, 'rgba(56,189,248,0.04)')
    g3.addColorStop(1, 'transparent')
    ctx.fillStyle = g3
    ctx.fillRect(0, 0, w, h)
  }
}

interface ParticleBackgroundProps {
  className?: string
}

function ParticleBackgroundInner({ className }: ParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<Star[]>([])
  const rafRef = useRef<number>(0)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const timeRef = useRef(0)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    mouseRef.current = {
      x: e.clientX / canvas.width,
      y: e.clientY / canvas.height,
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      starsRef.current = createStars(canvas.width, canvas.height, document.documentElement.classList.contains('light-theme'))
    }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', handleMouseMove)

    const draw = (timestamp: number) => {
      const dt = timestamp - timeRef.current
      timeRef.current = timestamp

      const w = canvas.width
      const h = canvas.height

      ctx.clearRect(0, 0, w, h)

      // Background fill — skip in light mode (let CSS background show through)
      const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light-theme')
      if (!isLight) {
        ctx.fillStyle = '#0A0D16'
        ctx.fillRect(0, 0, w, h)
      }

      // Nebulae (static — drawn every frame but cheap)
      drawNebulae(ctx, w, h, isLight)

      // Stars
      const t = timestamp / 1000
      for (const star of starsRef.current) {
        // Parallax offset based on mouse position and depth
        const parallaxFactor = star.depth === 1 ? 0.01 : star.depth === 2 ? 0.025 : 0.05
        const offsetX = (mouseRef.current.x - 0.5) * w * parallaxFactor
        const offsetY = (mouseRef.current.y - 0.5) * h * parallaxFactor

        const twinkle = Math.sin(t * star.speed + star.phase)
        const opacity = star.baseOpacity + twinkle * 0.12

        ctx.beginPath()
        ctx.arc(star.x + offsetX, star.y + offsetY, star.radius, 0, Math.PI * 2)
        ctx.fillStyle = star.color
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (!prefersReduced) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }

    if (prefersReduced) {
      // Draw one static frame
      draw(0)
    } else {
      rafRef.current = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
    }
  }, [handleMouseMove])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}

export const ParticleBackground = memo(ParticleBackgroundInner)

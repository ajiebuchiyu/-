import * as PIXI from 'pixi.js'

export type Weather = 'none' | 'rain' | 'snow' | 'sakura' | 'star'

interface Particle {
  sprite: PIXI.Graphics
  vx: number
  vy: number
  rot: number
}

/** 轻量粒子层：樱花 / 雨 / 雪 / 星光占位实现 */
export class ParticleLayer {
  container = new PIXI.Container()
  private particles: Particle[] = []
  private weather: Weather = 'none'
  private w = 960
  private h = 600

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
  }

  setWeather(weather: Weather): void {
    if (weather === this.weather) return
    this.weather = weather
    this.container.removeChildren()
    this.particles = []
    if (weather === 'none') return

    const count = weather === 'rain' ? 120 : weather === 'star' ? 60 : 80
    for (let i = 0; i < count; i++) {
      const g = this.makeParticle(weather)
      g.x = Math.random() * this.w
      g.y = Math.random() * this.h
      this.container.addChild(g)
      this.particles.push({
        sprite: g,
        vx: weather === 'sakura' ? (Math.random() - 0.5) * 0.6 : weather === 'snow' ? (Math.random() - 0.5) * 0.4 : 0,
        vy: weather === 'rain' ? 8 + Math.random() * 6 : weather === 'snow' ? 0.6 + Math.random() : 0.8 + Math.random() * 1.4,
        rot: (Math.random() - 0.5) * 0.06
      })
    }
  }

  private makeParticle(weather: Weather): PIXI.Graphics {
    const g = new PIXI.Graphics()
    if (weather === 'rain') {
      g.lineStyle(2, 0x9fc7ff, 0.5).moveTo(0, 0).lineTo(0, 12)
    } else if (weather === 'snow') {
      g.beginFill(0xffffff, 0.85).drawCircle(0, 0, 2 + Math.random() * 2).endFill()
    } else if (weather === 'sakura') {
      g.beginFill(0xffb7d5, 0.9).drawEllipse(0, 0, 5, 3).endFill()
    } else if (weather === 'star') {
      // PixiJS 7 核心 Graphics 无 drawStar（在 @pixi/graphics-extras 中），
      // 为保持零额外依赖，手动计算五角星顶点后用 drawPolygon 绘制
      g.beginFill(0xffe9a8, 0.9).drawPolygon(starPoints(0, 0, 5, 3, 1.4)).endFill()
    }
    return g
  }

  update(delta: number): void {
    if (this.weather === 'none') return
    for (const p of this.particles) {
      p.sprite.y += p.vy * delta
      p.sprite.x += p.vx * delta
      p.sprite.rotation += p.rot * delta
      if (this.weather === 'star') {
        p.sprite.alpha = 0.4 + Math.abs(Math.sin(p.sprite.y * 0.05 + performance.now() * 0.002)) * 0.6
      }
      if (p.sprite.y > this.h + 10) {
        p.sprite.y = -10
        p.sprite.x = Math.random() * this.w
      }
      if (p.sprite.x > this.w + 10) p.sprite.x = -10
      if (p.sprite.x < -10) p.sprite.x = this.w + 10
    }
  }
}

/** 计算五角星（或 N 角星）外/内顶点平铺数组，供 drawPolygon 使用 */
function starPoints(
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number
): number[] {
  const arr: number[] = []
  const step = Math.PI / points
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + i * step
    arr.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  return arr
}

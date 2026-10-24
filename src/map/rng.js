/*
 * 与 Python `random.Random(seed)` 逐位一致的伪随机数。
 *
 * 为什么非要一致：世界图与地方图原来是 `.scratch/terrain.py` / `.scratch/local.py`
 * 用 Python 画出来、再整包内联成 `src/map-data.js` 的（545 KB）。移植成 JS 之后，
 * 验证手段就是「同一份数据、同一个种子，JS 画出来的 SVG 跟 Python 画出来的逐字节相同」。
 * 只要有一个抖动不一样，整张图的岸线就全错位，那条验证也就没用了。
 *
 * 所以这里把 CPython 的两样东西原样搬过来：
 *   · MT19937 本体（`_genrand`）
 *   · CPython 的播种方式——整数种子先拆成小端 32 位字，再走 `init_by_array`
 *     （不是 MT19937 参考实现里那个 `init_genrand(seed)`）
 * 再加上 CPython 在 MT 之上那层：`random()` 取两个 32 位字拼 53 位尾数
 * （`genrand_res53`），`uniform` / `randint` / `randrange` 都从它和
 * `getrandbits` 推出来。
 *
 * 本文件只导出 `Random` 与 `uniform`。
 */

/** MT19937 的状态字数与中间偏移。 */
const N = 624
const M = 397
const MATRIX_A = 0x9908b0df
const UPPER_MASK = 0x80000000
const LOWER_MASK = 0x7fffffff

export class Random {
  constructor(seed = 0) {
    this.mt = new Uint32Array(N)
    this.mti = N + 1
    this.seed(seed)
  }

  /** 照 CPython `random_seed` 走：整数取绝对值，拆成小端 32 位字。 */
  seed(n) {
    let v = Math.abs(Math.trunc(n))
    const key = []
    if (v === 0) {
      key.push(0)
    } else {
      while (v > 0) {
        key.push(v >>> 0)
        v = Math.floor(v / 4294967296)
      }
    }
    this._initByArray(key)
    return this
  }

  _initGenrand(s) {
    this.mt[0] = s >>> 0
    for (let i = 1; i < N; i++) {
      const p = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = (Math.imul(1812433253, p) + i) >>> 0
    }
    this.mti = N
  }

  _initByArray(key) {
    this._initGenrand(19650218)
    let i = 1
    let j = 0
    let k = Math.max(N, key.length)
    for (; k; k--) {
      const p = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = ((this.mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0
      i++
      j++
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]
        i = 1
      }
      if (j >= key.length) j = 0
    }
    for (k = N - 1; k; k--) {
      const p = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = ((this.mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0
      i++
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]
        i = 1
      }
    }
    this.mt[0] = 0x80000000
  }

  _genrand() {
    if (this.mti >= N) {
      let kk
      if (this.mti === N + 1) this._initGenrand(5489)
      for (kk = 0; kk < N - M; kk++) {
        const y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK)
        this.mt[kk] = this.mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      }
      for (; kk < N - 1; kk++) {
        const y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK)
        this.mt[kk] = this.mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      }
      const y = (this.mt[N - 1] & UPPER_MASK) | (this.mt[0] & LOWER_MASK)
      this.mt[N - 1] = this.mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      this.mti = 0
    }
    let y = this.mt[this.mti++]
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  /** CPython `genrand_res53`：两个 32 位字拼出 53 位尾数。 */
  random() {
    const a = this._genrand() >>> 5
    const b = this._genrand() >>> 6
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0)
  }

  /** CPython `getrandbits(k)`，k 只用到 32 位以内。 */
  getrandbits(k) {
    if (k <= 32) return this._genrand() >>> (32 - k)
    throw new Error('getrandbits 只实现了 32 位以内')
  }

  /** CPython `_randbelow_with_getrandbits`。 */
  _randbelow(n) {
    if (n <= 0) throw new Error('_randbelow 要正数')
    // Python 是 `k = n.bit_length()`；`32 - Math.clz32(n)` 就是它。
    const k = 32 - Math.clz32(n)
    let r = this.getrandbits(k)
    while (r >= n) r = this.getrandbits(k)
    return r
  }

  /** CPython `random.uniform`。 */
  uniform(a, b) {
    return a + (b - a) * this.random()
  }

  /** CPython `random.randrange(start, stop)`。 */
  randrange(start, stop) {
    if (stop === undefined) {
      stop = start
      start = 0
    }
    const width = stop - start
    if (width <= 0) throw new Error('randrange 的空区间')
    return start + this._randbelow(width)
  }

  /** CPython `random.randint`。 */
  randint(a, b) {
    return this.randrange(a, b + 1)
  }
}

export function uniform(a, b) {
  return a + (b - a) * Math.random()
}

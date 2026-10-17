// 受限 Markdown 渲染：先转义再解析，不支持原始 HTML，链接仅 http(s)。
// 支持：标题、段落、粗/斜体、行内代码、代码块(高亮)、列表、引用、表格、分隔线、引用标记 [n]。
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const KW = /\b(const|let|var|function|return|if|else|for|while|async|await|import|export|from|class|new|try|catch|def|select|from|where|join|group|order|by|insert|update|delete|and|or|not|null|true|false|None|True|False)\b/gi

function highlight(code) {
  // 逐段扫描：注释、字符串、数字、关键字，其余原样（已转义）
  const re = /(\/\/[^\n]*|#[^\n]*|--[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)/g
  let out = ''
  let last = 0
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index)).replace(KW, '<b class="k">$1</b>')
    out += m[1] ? `<i class="c">${esc(m[1])}</i>` : m[2] ? `<span class="s">${esc(m[2])}</span>` : `<span class="n">${esc(m[3])}</span>`
    last = m.index + m[0].length
  }
  return out + esc(code.slice(last)).replace(KW, '<b class="k">$1</b>')
}

function inline(s, cites) {
  let t = esc(s)
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  t = t.replace(/\[(\d{1,2})\]/g, (all, n) => {
    const c = cites?.find(x => String(x.n) === n)
    if (c?.wisburg) return `<button class="cite" data-act="wis" data-res="${esc(c.wisburg.resource)}" data-id="${esc(c.wisburg.id)}" title="${esc(c.path)}">${n}</button>`
    return c?.fileId ? `<button class="cite" data-act="file" data-id="${esc(c.fileId)}" title="${esc(c.path)}">${n}</button>` : `<sup class="cite-x">${n}</sup>`
  })
  return t
}

export function md(src, cites) {
  const lines = String(src ?? '').replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  const para = []
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), cites)}</p>`); para.length = 0 } }
  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(/^```(\w*)/)
    if (fence) {
      flush()
      const buf = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      out.push(`<pre class="code"><span class="lang">${esc(fence[1] || 'text')}</span><code>${highlight(buf.join('\n'))}</code></pre>`)
      continue
    }
    if (/^\s*$/.test(line)) { flush(); i++; continue }
    const h = line.match(/^(#{1,4})\s+(.*)/)
    if (h) { flush(); out.push(`<h${h[1].length + 1}>${inline(h[2], cites)}</h${h[1].length + 1}>`); i++; continue }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      flush()
      const row = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const head = row(line)
      i += 2
      const body = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]))
      out.push(`<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(c, cites)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c, cites)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    if (/^>\s?/.test(line)) {
      flush()
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${inline(buf.join(' '), cites)}</blockquote>`)
      continue
    }
    const li = line.match(/^\s*([-*]|\d+[.)])\s+(.*)/)
    if (li) {
      flush()
      const ordered = /\d/.test(li[1])
      const items = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*]|\d+[.)])\s+(.*)/)
        if (!m) break
        items.push(`<li>${inline(m[2], cites)}</li>`)
        i++
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`)
      continue
    }
    para.push(line.trim())
    i++
  }
  flush()
  return out.join('')
}

/** CSV → 表格（文件预览用） */
export function csv(text) {
  const rows = String(text).trim().split('\n').map(l => l.split(','))
  const [head, ...body] = rows
  return `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

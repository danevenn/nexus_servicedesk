import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { Mistral } from '@mistralai/mistralai'
import pptxgen from 'pptxgenjs'
import { Resend } from 'resend'

// ── Configuración ──────────────────────────────────────────────────────────

const ROOT = process.env.REPO_ROOT || process.cwd()
const REPO = process.env.REPO_NAME || 'unknown/repo'
const SHA = process.env.COMMIT_SHA || '0000000'
const SHORT_SHA = SHA.slice(0, 7)
const repoShort = REPO.split('/')[1] || 'repo'

// ── A. Recopilar contexto del proyecto ────────────────────────────────────

// Evento que disparó el workflow: 'push', 'workflow_dispatch' (manual) o 'manual'
// (ejecución local). En manual/dispatch documentamos una muestra del proyecto;
// en push solo si hay cambios de código (para no enviar emails sin motivo).
const eventName = process.env.GITHUB_EVENT_NAME || 'manual'
const isManual = eventName === 'workflow_dispatch' || eventName === 'manual'

const isCodeFile = f => /\.(ts|tsx|js|mjs)$/.test(f) && !f.includes('node_modules') && !f.includes('.github')

// Muestra representativa del proyecto (cuando se documenta entero)
const sampleProjectFiles = () => {
  for (const dir of ['src', 'app', 'lib', 'components']) {
    if (!fs.existsSync(path.join(ROOT, dir))) continue
    try {
      const found = execSync(
        `find ${dir} -type f \\( -name "*.ts" -o -name "*.tsx" \\) | head -10`,
        { cwd: ROOT }
      ).toString().trim().split('\n').filter(Boolean)
      if (found.length) return found
    } catch { /* siguiente dir */ }
  }
  return []
}

// Ficheros modificados en este push (excluye generados y node_modules)
let changedFiles = []
try {
  changedFiles = execSync('git diff --name-only HEAD~1 HEAD', { cwd: ROOT })
    .toString().trim().split('\n').filter(isCodeFile)
} catch {
  // Primer commit / sin HEAD~1: tratamos como ejecución completa
  changedFiles = []
}

if (changedFiles.length === 0) {
  if (isManual) {
    console.log('Ejecución manual: documentando una muestra del proyecto completo.')
    changedFiles = sampleProjectFiles()
  } else {
    console.log('Push sin cambios de código (.ts/.tsx/.js). Omitiendo generación.')
    process.exit(0)
  }
}

if (changedFiles.length === 0) {
  console.log('No se encontraron ficheros de código para documentar. Omitiendo.')
  process.exit(0)
}

// Árbol de directorios src/ o app/ (máx 60 entradas)
const srcDir = fs.existsSync(path.join(ROOT, 'src')) ? 'src' : 'app'
let srcTree = '(no disponible)'
try {
  srcTree = execSync(`find ${srcDir} -type f | sort | head -60`, { cwd: ROOT }).toString().trim()
} catch { /* noop */ }

// package.json del proyecto
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const pkgInfo = JSON.stringify({
  name: pkg.name,
  description: pkg.description,
  scripts: pkg.scripts,
  dependencies: pkg.dependencies,
  devDependencies: Object.keys(pkg.devDependencies || {})
})

// Contenido de ficheros modificados (máx 10 × 12 000 chars)
const fileContents = changedFiles.slice(0, 10).map(f => {
  const full = path.join(ROOT, f)
  if (!fs.existsSync(full)) return null
  const content = fs.readFileSync(full, 'utf8').slice(0, 12000)
  return `\n\n### ${f}\n\`\`\`typescript\n${content}\n\`\`\``
}).filter(Boolean).join('')

// ── B. Llamadas a Mistral API ─────────────────────────────────────────────

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })
const MODEL = 'mistral-small-latest'

// Wrapper con reintentos: el free tier de Mistral limita a ~1 req/s, así que
// ante un 429/5xx esperamos y reintentamos (backoff). `json` activa el modo
// JSON estricto del modelo.
const ask = async (prompt, { json = false } = {}) => {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await mistral.chat.complete({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        ...(json ? { responseFormat: { type: 'json_object' } } : {})
      })
      return res.choices[0].message.content
    } catch (err) {
      const status = err?.statusCode || err?.status
      if ((status === 429 || status >= 500) && attempt < 4) {
        const wait = attempt * 2500
        console.log(`  Reintento ${attempt}/3 tras ${status} (espera ${wait}ms)…`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      throw err
    }
  }
}

console.log(`Generando docs para ${REPO}@${SHORT_SHA} (${changedFiles.length} ficheros)…`)

// Llamadas SECUENCIALES (el free tier de Mistral no admite ráfagas paralelas).

// 1. README en inglés (repo público)
const readme = await ask(`
You are a senior technical writer. Generate a complete, professional README.md in ENGLISH for the GitHub repository "${REPO}".

Structure:
# <Project Name>
> Tagline (one sentence)

Badges: Node.js version, Next.js version, TypeScript, License MIT (use shields.io format)

## Features
- Bullet list of key features

## Tech Stack
| Technology | Version | Purpose |
|...

## Prerequisites
## Installation
## Environment Variables
| Variable | Required | Description |
|...

## Available Scripts
## Project Structure (tree format, max 20 lines)
## Contributing
## License

Project info: ${pkgInfo}
Directory structure:
${srcTree}

Output ONLY the raw Markdown. No explanation, no code fence wrapping the markdown.
`)

// 2. Documentación de funciones en español
const funcDocs = await ask(`
Eres un documentador técnico senior. Analiza los siguientes ficheros TypeScript/TSX modificados en el repositorio "${REPO}" (commit ${SHORT_SHA}).

Genera un documento Markdown en ESPAÑOL con la siguiente estructura:
# Documentación de funciones — ${pkg.name || repoShort}
> Commit: \`${SHORT_SHA}\` · Ficheros: ${changedFiles.join(', ')}

Para cada fichero modificado, crea una sección H2 con el nombre del fichero.
Para cada función exportada, hook, Server Action, tipo o interfaz, crea una sección H3 con:
- **Descripción**: qué hace, cuándo usarla
- **Parámetros**: tabla con nombre, tipo y descripción
- **Retorno**: tipo y descripción
- **Ejemplo de uso**: bloque de código TypeScript

Ficheros a documentar:${fileContents}

Output ONLY el Markdown. Sin texto introductorio ni explicación adicional.
`)

// 3. Datos para PPTX (JSON estructurado)
const slidesRaw = await ask(`
Generate JSON for a 10-slide PowerPoint presentation about "${pkg.name || repoShort}".
Return a JSON object: { "slides": [ { "title": string, "bullets": string[], "notes": string } ] }

Slide topics in order:
1. Title slide: project name + tagline
2. Problem / use case it solves
3. Tech stack and key dependencies
4. High-level architecture (layers/modules)
5. Key components / features
6. Data model or API design (if applicable)
7. Authentication and security approach
8. Deployment pipeline (Vercel, GitHub Actions, CI)
9. Getting started in 3 steps
10. Roadmap / future improvements

Context:
- Repo: ${REPO}
- Package info: ${pkgInfo}
- Directory structure: ${srcTree}

Return ONLY the JSON object.
`, { json: true })

let slides = []
try {
  const raw = slidesRaw.trim()
  const cleaned = raw.startsWith('```') ? raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '') : raw
  const parsed = JSON.parse(cleaned)
  slides = Array.isArray(parsed) ? parsed : (parsed.slides || [])
} catch (err) {
  console.warn('Advertencia al parsear slides JSON:', err.message)
  slides = [
    { title: pkg.name || repoShort, bullets: ['Documentación técnica generada automáticamente con Mistral AI'], notes: '' },
    { title: 'Tech Stack', bullets: Object.keys(pkg.dependencies || {}).slice(0, 6), notes: '' }
  ]
}

// ── C. Generar presentación PPTX ─────────────────────────────────────────

console.log(`Generando PPTX (${slides.length} slides)…`)

const prs = new pptxgen()
prs.layout = 'LAYOUT_WIDE'
prs.title = `${pkg.name || repoShort} — Arquitectura`
prs.subject = 'Documentación técnica · Generado automáticamente'
prs.author = 'Daniel Rodea'

const ACCENT = '2563EB'
const BG = 'F8FAFC'
const TEXT_DARK = '1E293B'
const TEXT_MID = '475569'

slides.forEach((slide, i) => {
  const s = prs.addSlide()
  const isCover = i === 0

  s.background = { color: isCover ? ACCENT : BG }

  // Título
  s.addText(String(slide.title || `Slide ${i + 1}`), {
    x: 0.5, y: isCover ? 1.8 : 0.3,
    w: '90%', h: isCover ? 1.2 : 0.8,
    fontSize: isCover ? 38 : 26,
    bold: true,
    color: isCover ? 'FFFFFF' : TEXT_DARK,
    fontFace: 'Calibri',
    align: isCover ? 'center' : 'left'
  })

  // Bullets
  const bullets = Array.isArray(slide.bullets) ? slide.bullets.filter(Boolean) : []
  if (bullets.length > 0) {
    const textObjs = bullets.map(b => ({
      text: String(b),
      options: { bullet: { type: 'bullet' }, paraSpaceBefore: 4 }
    }))
    s.addText(textObjs, {
      x: 0.5, y: isCover ? 3.2 : 1.3,
      w: '90%', h: 4.2,
      fontSize: isCover ? 18 : 16,
      color: isCover ? 'DBEAFE' : TEXT_MID,
      fontFace: 'Calibri'
    })
  }

  // Pie de página (slides interiores)
  if (!isCover) {
    s.addText(`${pkg.name || repoShort}  ·  ${SHORT_SHA}`, {
      x: 0.5, y: 6.8, w: '90%', h: 0.3,
      fontSize: 10, color: 'CBD5E1', italic: true, align: 'right'
    })
  }

  if (slide.notes) s.addNotes(String(slide.notes))
})

const pptxPath = '/tmp/architecture.pptx'
await prs.writeFile({ fileName: pptxPath })
const pptxBase64 = fs.readFileSync(pptxPath).toString('base64')

// ── D. Enviar email con Resend ────────────────────────────────────────────

console.log('Enviando email…')

const resend = new Resend(process.env.RESEND_API_KEY)

const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:860px;margin:0 auto;padding:24px;background:#f1f5f9;color:#1e293b">

  <!-- Header -->
  <div style="background:#2563EB;color:white;padding:28px 32px;border-radius:12px 12px 0 0">
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700">📄 ${pkg.name || repoShort}</h1>
    <p style="margin:0;font-size:13px;opacity:0.85">
      Documentación generada automáticamente ·
      commit <code style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:4px;font-size:12px">${SHORT_SHA}</code>
    </p>
  </div>

  <div style="background:white;border:1px solid #e2e8f0;border-top:none;padding:28px 32px;border-radius:0 0 12px 12px">

    <!-- Ficheros modificados -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Ficheros modificados</p>
      <div style="font-family:monospace;font-size:13px;color:#475569;line-height:1.8">
        ${changedFiles.map(f => `· ${f}`).join('<br>')}
      </div>
    </div>

    <!-- Adjunto info -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:28px">
      <p style="margin:0;font-size:13px;color:#1e40af">
        📎 <strong>Adjunto:</strong> ${repoShort}-architecture.pptx (${slides.length} diapositivas)
      </p>
    </div>

    <!-- README -->
    <h2 style="font-size:16px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px">README.md</h2>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;overflow-x:auto">
      <pre style="margin:0;font-size:12px;color:#334155;white-space:pre-wrap;font-family:'Menlo','Monaco','Courier New',monospace;line-height:1.6">${escape(readme)}</pre>
    </div>

    <!-- Documentación de funciones -->
    <h2 style="font-size:16px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-top:28px">Documentación de funciones</h2>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;overflow-x:auto">
      <pre style="margin:0;font-size:12px;color:#334155;white-space:pre-wrap;font-family:'Menlo','Monaco','Courier New',monospace;line-height:1.6">${escape(funcDocs)}</pre>
    </div>

    <!-- Footer -->
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0">
      <p style="font-size:11px;color:#94a3b8;margin:0">
        Generado por GitHub Actions · Mistral AI · ${new Date().toISOString()}<br>
        Repositorio: <a href="https://github.com/${REPO}" style="color:#2563EB">${REPO}</a>
      </p>
    </div>

  </div>
</body>
</html>`

const { error } = await resend.emails.send({
  from: 'onboarding@resend.dev',
  to: 'dannyrodea@gmail.com',
  subject: `[docs] ${repoShort} — ${changedFiles.length} fichero(s) documentado(s) (${SHORT_SHA})`,
  html: htmlBody,
  attachments: [{
    filename: `${repoShort}-architecture.pptx`,
    content: pptxBase64
  }]
})

if (error) {
  console.error('Error al enviar email:', error)
  process.exit(1)
}

console.log(`✓ Email enviado a dannyrodea@gmail.com`)
console.log(`  Repo: ${REPO} · Commit: ${SHORT_SHA}`)
console.log(`  Ficheros documentados: ${changedFiles.length}`)
console.log(`  Diapositivas generadas: ${slides.length}`)

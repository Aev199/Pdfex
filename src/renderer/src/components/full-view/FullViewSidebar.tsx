import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PageView } from '../PageView'
import type { DocEntry, PdfSource } from '../../types'
import { listLayers, setLayersVisible, useLayerVersion } from '../../pdfx/layers'
import type { Layer } from '../../pdfx/layers'

// Reader sidebar: page thumbnails of the open document, the PDF's own
// outline (bookmarks), or its layers when it has any.

export interface OutlineNode {
  title: string
  // Page in the open document, or null when it points elsewhere.
  pageIndex: number | null
  items: OutlineNode[]
}

type RawOutline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>

async function resolvePage(pdf: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const target = explicit[0]
    if (typeof target === 'number') return target
    return await pdf.getPageIndex(target)
  } catch {
    return null
  }
}

// The outline of the document's first source, with each entry mapped to the
// matching page of the document as it is now (pages may be reordered or
// missing).
export async function loadOutline(doc: DocEntry): Promise<OutlineNode[]> {
  const source: PdfSource | undefined = doc.pages[0]?.source
  if (!source) return []
  const raw: RawOutline | null = await source.pdf.getOutline().catch(() => null)
  if (!raw) return []
  const convert = async (items: NonNullable<RawOutline>): Promise<OutlineNode[]> =>
    Promise.all(
      items.map(async (item) => {
        const sourceIndex = await resolvePage(source.pdf, item.dest)
        const pageIndex =
          sourceIndex === null
            ? null
            : doc.pages.findIndex((p) => p.source === source && p.pageIndex === sourceIndex)
        return {
          title: item.title,
          pageIndex: pageIndex === null || pageIndex < 0 ? null : pageIndex,
          items: await convert(item.items ?? [])
        }
      })
    )
  return convert(raw)
}

function OutlineList({
  nodes,
  onGo
}: {
  nodes: OutlineNode[]
  onGo: (pageIndex: number) => void
}): React.JSX.Element {
  return (
    <ul className="fv-outline">
      {nodes.map((node, i) => (
        <li key={i}>
          <button
            className="fv-outline-item"
            disabled={node.pageIndex === null}
            title={node.title}
            onClick={() => node.pageIndex !== null && onGo(node.pageIndex)}
          >
            {node.title}
          </button>
          {node.items.length > 0 && <OutlineList nodes={node.items} onGo={onGo} />}
        </li>
      ))}
    </ul>
  )
}

// The layers of the document's file (the first source: a document made of
// several files shows the first one's).
function LayerList({ pdf }: { pdf: PdfSource['pdf'] }): React.JSX.Element {
  const version = useLayerVersion(pdf)
  const [layers, setLayers] = useState<Layer[]>([])
  useEffect(() => {
    let alive = true
    void listLayers(pdf).then((list) => alive && setLayers(list))
    return () => {
      alive = false
    }
  }, [pdf, version])
  const all = layers.map((l) => l.id)
  return (
    <div className="fv-layers">
      <div className="fv-layers-actions">
        <button onClick={() => void setLayersVisible(pdf, all, true)}>Show all</button>
        <button onClick={() => void setLayersVisible(pdf, all, false)}>Hide all</button>
      </div>
      {layers.map((layer) => (
        <label key={layer.id} className="fv-layer" title={layer.name}>
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={(e) => void setLayersVisible(pdf, [layer.id], e.target.checked)}
          />
          <span>{layer.name}</span>
        </label>
      ))}
      <p className="fv-layers-hint">Hidden layers stay in exports, switched off.</p>
    </div>
  )
}

interface SidebarProps {
  doc: DocEntry
  current: number
  onGo: (pageIndex: number) => void
}

export function FullViewSidebar({ doc, current, onGo }: SidebarProps): React.JSX.Element {
  const [tab, setTab] = useState<'pages' | 'outline' | 'layers'>('pages')
  const [outline, setOutline] = useState<OutlineNode[] | null>(null)
  const pdf = doc.pages[0]?.source.pdf
  const [hasLayers, setHasLayers] = useState(false)
  useEffect(() => {
    let alive = true
    setHasLayers(false)
    if (pdf) void listLayers(pdf).then((list) => alive && setHasLayers(list.length > 0))
    return () => {
      alive = false
    }
  }, [pdf])
  useEffect(() => {
    if (tab === 'layers' && !hasLayers) setTab('pages')
  }, [tab, hasLayers])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setOutline(null)
    void loadOutline(doc).then((nodes) => alive && setOutline(nodes))
    return () => {
      alive = false
    }
  }, [doc])

  // Keep the current page's thumbnail in view while paging.
  useEffect(() => {
    if (tab !== 'pages') return
    const el = listRef.current?.querySelector(`[data-index="${current}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [current, tab])

  return (
    <aside className="fv-sidebar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="fv-sidebar-tabs">
        <button className={tab === 'pages' ? 'on' : ''} onClick={() => setTab('pages')}>
          Pages
        </button>
        <button
          className={tab === 'outline' ? 'on' : ''}
          disabled={outline !== null && outline.length === 0}
          title={outline !== null && outline.length === 0 ? 'This PDF has no outline' : undefined}
          onClick={() => setTab('outline')}
        >
          Outline
        </button>
        {hasLayers && (
          <button className={tab === 'layers' ? 'on' : ''} onClick={() => setTab('layers')}>
            Layers
          </button>
        )}
      </div>
      <div className="fv-sidebar-body" ref={listRef}>
        {tab === 'pages' ? (
          doc.pages.map((page, i) => (
            <button
              key={page.id}
              data-index={i}
              className={'fv-thumb' + (i === current ? ' on' : '')}
              onClick={() => onGo(i)}
            >
              <span
                className="fv-thumb-page"
                style={{ aspectRatio: `${page.width} / ${page.height}` }}
              >
                <PageView
                  pdf={page.source.pdf}
                  pageNumber={page.pageIndex + 1}
                  naturalWidth={page.width}
                  naturalHeight={page.height}
                  version={0}
                  detail={false}
                />
              </span>
              <span className="fv-thumb-number">{i + 1}</span>
            </button>
          ))
        ) : tab === 'layers' && pdf ? (
          <LayerList pdf={pdf} />
        ) : (
          <OutlineList nodes={outline ?? []} onGo={onGo} />
        )}
      </div>
    </aside>
  )
}

import { ANNOTATE_TOOLS } from '../../edit/types'
import type { AnnotateTool, EditTool } from '../../edit/types'
import { DRAW_COLORS, DRAW_WIDTHS } from '../../elements/types'
import type { DrawStyle } from '../../elements/types'

// Pen, shapes and eraser with colour and width, under the full-view header
// while editing.

const LABELS: Record<AnnotateTool, string> = {
  pen: 'Pen',
  line: 'Line',
  arrow: 'Arrow',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  eraser: 'Eraser (sweep over marks to remove them)'
}

function ToolIcon({ tool }: { tool: AnnotateTool }): React.JSX.Element {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 18 18',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
  switch (tool) {
    case 'pen':
      return (
        <svg {...common}>
          <path d="M3 15c2-1 3-4 5-6s4-4 6-5c-1 2-3 4-5 6s-4 3-6 5Z" />
        </svg>
      )
    case 'line':
      return (
        <svg {...common}>
          <path d="M3 15 15 3" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M3 15 15 3M8 3h7v7" />
        </svg>
      )
    case 'rect':
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="12" height="9" rx="0.5" />
        </svg>
      )
    case 'ellipse':
      return (
        <svg {...common}>
          <ellipse cx="9" cy="9" rx="6.5" ry="4.8" />
        </svg>
      )
    case 'eraser':
      return (
        <svg {...common}>
          <path d="m7 15 8-8-4-4-8 8 4 4Zm0 0h8M5 9l4 4" />
        </svg>
      )
  }
}

interface AnnotateBarProps {
  tool: EditTool | null
  style: DrawStyle
  onTool: (tool: EditTool) => void
  onStyle: (style: DrawStyle) => void
}

export function AnnotateBar({ tool, style, onTool, onStyle }: AnnotateBarProps): React.JSX.Element {
  return (
    <div className="annotate-bar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="annotate-group">
        {ANNOTATE_TOOLS.map((t) => (
          <button
            key={t}
            className={'annotate-tool' + (tool === t ? ' on' : '')}
            title={LABELS[t]}
            aria-pressed={tool === t}
            onClick={() => onTool(t)}
          >
            <ToolIcon tool={t} />
          </button>
        ))}
      </div>
      <span className="annotate-sep" />
      <div className="annotate-group">
        {DRAW_COLORS.map((color) => (
          <button
            key={color}
            className={'annotate-swatch' + (style.color === color ? ' on' : '')}
            title="Colour"
            style={{ background: color }}
            onClick={() => onStyle({ ...style, color })}
          />
        ))}
      </div>
      <span className="annotate-sep" />
      <div className="annotate-group">
        {DRAW_WIDTHS.map((width) => (
          <button
            key={width}
            className={'annotate-width' + (style.strokeWidth === width ? ' on' : '')}
            title={`Line width ${width} pt`}
            onClick={() => onStyle({ ...style, strokeWidth: width })}
          >
            <span style={{ height: Math.max(1.5, width), background: style.color }} />
          </button>
        ))}
      </div>
    </div>
  )
}

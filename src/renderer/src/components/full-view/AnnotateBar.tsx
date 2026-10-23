import { ANNOTATE_TOOLS, MARK_COLORS, TEXT_MARK_COLORS } from '../../edit/types'
import type { AnnotateTool, EditTool, MarkLook, MarkStyle } from '../../edit/types'
import { DRAW_COLORS, DRAW_WIDTHS, TEXT_SIZES } from '../../elements/types'
import type { DrawStyle, TextFont, TextStyle } from '../../elements/types'

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
  textStyle: TextStyle
  onTextStyle: (style: TextStyle) => void
  markLook: MarkLook
  onMarkLook: (look: MarkLook) => void
  // A text element is selected: the text controls restyle it.
  textSelected: boolean
}

const FONT_LABELS: Record<TextFont, string> = { sans: 'Sans', serif: 'Serif', mono: 'Mono' }

const MARK_STYLE_LABELS: Record<MarkStyle, string> = {
  fill: 'Highlight',
  underline: 'Underline',
  strike: 'Strikethrough'
}

function MarkStyleIcon({ style }: { style: MarkStyle }): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {style === 'fill' && (
        <rect x="2" y="4" width="14" height="10" rx="1" fill="currentColor" opacity="0.35" />
      )}
      <text x="9" y="12.5" textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor">
        ab
      </text>
      {style === 'underline' && <path d="M3 15h12" stroke="currentColor" strokeWidth="1.6" />}
      {style === 'strike' && <path d="M3 9h12" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  )
}

function TextControls({
  value,
  onChange
}: {
  value: TextStyle
  onChange: (style: TextStyle) => void
}): React.JSX.Element {
  return (
    <>
      <div className="annotate-group">
        <select
          className="annotate-select"
          title="Font"
          value={value.font}
          onChange={(e) => onChange({ ...value, font: e.target.value as TextFont })}
        >
          {(Object.keys(FONT_LABELS) as TextFont[]).map((font) => (
            <option key={font} value={font}>
              {FONT_LABELS[font]}
            </option>
          ))}
        </select>
        <select
          className="annotate-select"
          title="Size"
          value={value.fontSize}
          onChange={(e) => onChange({ ...value, fontSize: Number(e.target.value) })}
        >
          {TEXT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} pt
            </option>
          ))}
        </select>
        <button
          className={'annotate-tool' + (value.bold ? ' on' : '')}
          title="Bold"
          aria-pressed={value.bold}
          onClick={() => onChange({ ...value, bold: !value.bold })}
        >
          <b>B</b>
        </button>
      </div>
      <span className="annotate-sep" />
      <div className="annotate-group">
        {DRAW_COLORS.map((color) => (
          <button
            key={color}
            className={'annotate-swatch' + (value.color === color ? ' on' : '')}
            title="Colour"
            style={{ background: color }}
            onClick={() => onChange({ ...value, color })}
          />
        ))}
      </div>
    </>
  )
}

function MarkControls({
  value,
  onChange
}: {
  value: MarkLook
  onChange: (look: MarkLook) => void
}): React.JSX.Element {
  return (
    <>
      <div className="annotate-group">
        {(Object.keys(MARK_STYLE_LABELS) as MarkStyle[]).map((style) => (
          <button
            key={style}
            className={'annotate-tool' + (value.style === style ? ' on' : '')}
            title={MARK_STYLE_LABELS[style]}
            aria-pressed={value.style === style}
            onClick={() => onChange({ ...value, style })}
          >
            <MarkStyleIcon style={style} />
          </button>
        ))}
      </div>
      <span className="annotate-sep" />
      <div className="annotate-group">
        {TEXT_MARK_COLORS.map((color) => (
          <button
            key={color}
            className={'annotate-swatch' + (value.color === color ? ' on' : '')}
            title={color}
            style={{ background: MARK_COLORS[color] }}
            onClick={() => onChange({ ...value, color })}
          />
        ))}
      </div>
    </>
  )
}

export function AnnotateBar({
  tool,
  style,
  onTool,
  onStyle,
  textStyle,
  onTextStyle,
  markLook,
  onMarkLook,
  textSelected
}: AnnotateBarProps): React.JSX.Element {
  const showText = tool === 'text' || (tool === null && textSelected)
  const showMark = tool === 'highlight'
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
      {showText ? (
        <TextControls value={textStyle} onChange={onTextStyle} />
      ) : showMark ? (
        <MarkControls value={markLook} onChange={onMarkLook} />
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}

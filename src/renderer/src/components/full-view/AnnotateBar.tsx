import { ANNOTATE_TOOLS, MARK_COLORS, TEXT_MARK_COLORS, isMeasureTool } from '../../edit/types'
import type { AnnotateTool, EditTool, MarkLook, MarkStyle } from '../../edit/types'
import { DRAW_COLORS, DRAW_WIDTHS, TEXT_SIZES } from '../../elements/types'
import type {
  DrawStyle,
  MeasureScale,
  MeasureUnit,
  TextFont,
  TextStyle
} from '../../elements/types'
import { SCALE_RATIOS, UNIT_LABELS, convertScale, ratioScale } from '../../elements/measures'

// Pen, shapes and eraser with colour and width, under the full-view header
// while editing.

const LABELS: Record<AnnotateTool, string> = {
  pen: 'Pen',
  line: 'Line',
  arrow: 'Arrow',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  callout: 'Callout: drag from the point to where the text goes',
  distance: 'Measure length',
  path: 'Measure a polyline: click the points, double-click to finish',
  area: 'Measure an area: click the corners, double-click to finish',
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
    case 'callout':
      return (
        <svg {...common}>
          <rect x="7" y="2.5" width="9" height="6.5" rx="0.5" />
          <path d="M8.5 9 3 15.5" />
        </svg>
      )
    case 'distance':
      return (
        <svg {...common}>
          <path d="M2.5 9h13M2.5 6v6M15.5 6v6" />
        </svg>
      )
    case 'path':
      return (
        <svg {...common}>
          <path d="M2.5 14 7 6l4 6 4.5-8" />
          <circle cx="2.5" cy="14" r="0.6" />
          <circle cx="15.5" cy="4" r="0.6" />
        </svg>
      )
    case 'area':
      return (
        <svg {...common}>
          <path d="M3 13.5 5 4l9 2 1.5 8Z" />
          <path d="M6 10.5h5" strokeWidth="1" />
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
  measureScale: MeasureScale
  onMeasureScale: (scale: MeasureScale) => void
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

function MeasureControls({
  scale,
  onScale,
  calibrating,
  onCalibrate,
  style,
  onStyle
}: {
  scale: MeasureScale
  onScale: (scale: MeasureScale) => void
  calibrating: boolean
  onCalibrate: () => void
  style: DrawStyle
  onStyle: (style: DrawStyle) => void
}): React.JSX.Element {
  const ratio = scale.label.startsWith('1:') ? scale.label : 'calibrated'
  return (
    <>
      <div className="annotate-group">
        <select
          className="annotate-select"
          title="Drawing scale"
          value={ratio}
          onChange={(e) => {
            if (e.target.value !== 'calibrated') {
              onScale(ratioScale(Number(e.target.value.slice(2)), scale.unit))
            }
          }}
        >
          {SCALE_RATIOS.map((r) => (
            <option key={r} value={`1:${r}`}>
              1:{r}
            </option>
          ))}
          {ratio === 'calibrated' && <option value="calibrated">Calibrated</option>}
        </select>
        <select
          className="annotate-select"
          title="Units"
          value={scale.unit}
          onChange={(e) => onScale(convertScale(scale, e.target.value as MeasureUnit))}
        >
          {(Object.keys(UNIT_LABELS) as MeasureUnit[]).map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_LABELS[unit]}
            </option>
          ))}
        </select>
        <button
          className={'annotate-tool annotate-text-btn' + (calibrating ? ' on' : '')}
          title="Calibrate: draw over a dimension of known length"
          aria-pressed={calibrating}
          onClick={onCalibrate}
        >
          Calibrate
        </button>
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
  textSelected,
  measureScale,
  onMeasureScale
}: AnnotateBarProps): React.JSX.Element {
  const showText = tool === 'text' || tool === 'callout' || (tool === null && textSelected)
  const showMark = tool === 'highlight'
  const showMeasure = isMeasureTool(tool) || tool === 'calibrate'
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
      {showMeasure ? (
        <MeasureControls
          scale={measureScale}
          onScale={onMeasureScale}
          calibrating={tool === 'calibrate'}
          onCalibrate={() => onTool('calibrate')}
          style={style}
          onStyle={onStyle}
        />
      ) : showText ? (
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

import { useState } from 'react'
import { Dialog } from './Dialog'

export type HelpTopic = 'guide' | 'shortcuts'

const MOD = window.api?.platform === 'darwin' ? '⌘' : 'Ctrl'
const COPY_DRAG = window.api?.platform === 'darwin' ? 'Alt' : 'Ctrl'

const SHORTCUTS: [string, [string, string][]][] = [
  [
    'Canvas',
    [
      ['Wheel', 'Scroll up and down (Settings can make it zoom)'],
      ['Shift + wheel', 'Scroll sideways'],
      [`${MOD} + wheel, pinch`, 'Zoom around the pointer'],
      ['Middle button drag', 'Move the canvas from anywhere'],
      [`${MOD} + 0`, 'Fit to window'],
      [`${MOD} + =  /  ${MOD} + -`, 'Zoom in / out'],
      ['Double-click a page', 'Open it in the reader']
    ]
  ],
  [
    'Pages and documents',
    [
      [`${MOD} + click, Shift + click`, 'Add a page / a range to the selection'],
      [`${MOD} + A`, 'Select all pages'],
      [`${MOD} + C  /  ${MOD} + V`, 'Copy the selected pages / paste after the selected page'],
      [`${MOD} + D`, 'Duplicate the selection'],
      [`${MOD} + Shift + +  /  ${MOD} + Shift + -`, 'Rotate the selection right / left'],
      ['Delete', 'Delete the selection'],
      ['Drag a page', 'Move it; with ' + COPY_DRAG + ' held, copy it'],
      [`${MOD} + Z  /  ${MOD} + Y`, 'Undo / redo'],
      [`${MOD} + F`, 'Find in all documents of the tab'],
      ['Esc', 'Clear the selection']
    ]
  ],
  [
    'Reader',
    [
      ['Wheel, ↑ ↓, ← →', 'Previous / next page (the next document follows)'],
      ['Home, End', 'First / last page of the document'],
      ['F4', 'Thumbnails and outline'],
      ['F6', 'Comments'],
      [`${MOD} + Shift + +  /  ${MOD} + Shift + -`, 'Rotate the page right / left'],
      ['Page number', 'Type a number and press Enter'],
      [`${MOD} + C`, 'Copy the selected text'],
      ['Esc', 'Back to the canvas']
    ]
  ],
  [
    'Files and tabs',
    [
      [`${MOD} + O`, 'Open files'],
      [`${MOD} + P`, 'Print'],
      [`${MOD} + E`, 'Export .pdfx'],
      [`${MOD} + Shift + S`, 'Save the session as .pdfxs'],
      [`${MOD} + T  /  ${MOD} + W`, 'New tab / close tab'],
      ['Ctrl + Tab', 'Next tab'],
      [`${MOD} + ,`, 'Settings'],
      ['F1', 'This help']
    ]
  ]
]

function Guide(): React.JSX.Element {
  return (
    <div className="help-guide">
      <h3>Opening files</h3>
      <p>
        On Windows, Settings → PDF files offers PDFx for PDFs (Open with, the Explorer menu) and
        Make default… picks it as the PDF program. File → Open Recent lists the files opened lately.
        A password-protected PDF asks for its password; its exported copies are not protected.
      </p>
      <p>
        Drop PDFs, images or Word, Excel and PowerPoint documents onto the window or onto pdfx.exe,
        or use File → Open. Office files are converted to PDF by Microsoft Office when it is
        installed, otherwise by LibreOffice; macros stay off and nothing leaves the computer.
      </p>
      <h3>The canvas</h3>
      <p>
        Every document is a row of pages. Right-click a page or a document for its menu: duplicate,
        copy, split, extract, rotate, export, open in another program, show in Explorer, move to
        another tab, delete. Drag pages between documents, or between rows to start a new document.
        Drag a document&apos;s number (01, 02…) to Explorer to get a PDF.
      </p>
      <h3>Reading</h3>
      <p>
        Double-click a page to read it full screen. Pages follow each other top to bottom: the mouse
        wheel turns one page per notch, a touchpad scrolls. The buttons next to the title switch to
        one long scroll fitted to the width or to two pages side by side ({MOD} + wheel zooms
        there). F4 shows thumbnails, the outline or the drawing&apos;s layers (hide dimensions,
        hatching…; exports keep hidden layers switched off). Opening a file again offers to continue
        at the page where you stopped. Links work, text can be selected and copied. Large drawings
        are redrawn sharply after zooming, up to 9000%.
      </p>
      <h3>Annotations</h3>
      <p>
        In the reader press Edit: signature, text, highlight, redaction, pen, line, arrow,
        rectangle, ellipse, callout and eraser. Text takes a font, size, weight and colour (select
        text you added to restyle it); highlights can be a colour, an underline or a strikethrough.
        Shift keeps lines at 45° and shapes square. Source PDFs are never changed: annotations live
        in the session and go into a PDF only on export or print.
      </p>
      <h3>Measuring drawings</h3>
      <p>
        The ruler tools measure a length, a polyline and an area: drag for a length; click the
        points of a polyline or an area and double-click (or Enter) to finish, Backspace takes the
        last point back. Pick the drawing scale (1:100…) and units, or press Calibrate and draw a
        dimension whose real length you know. Labels are exported as text.
      </p>
      <h3>Comments</h3>
      <p>
        F6 or the speech-bubble button opens the comments of the document. New, then a click on the
        page, pins a comment there; others can reply, edit, resolve or delete. Resolved comments
        leave the page (Show resolved brings them back), and the eye hides all pins. Comments are
        not part of the page: they are saved with the session and exported as PDF sticky notes with
        their replies, which Acrobat and other viewers show as a conversation. Comments already in a
        PDF (from Acrobat, Foxit…) appear in the panel too and can be answered and resolved; they
        stay in the file as they were. Your name is set in Settings. Settings → Export can also save
        marks and drawings as annotations others can move or delete, instead of drawing them into
        the page.
      </p>
      <h3>Comparing revisions</h3>
      <p>
        Select two pages ({MOD} + click), right-click and choose Compare the 2 pages. The first page
        in the canvas is the old revision: what was removed is red, what was added is blue, and what
        both share is grey. 1, 2, 3 switch between the differences, the old and the new sheet; the
        arrows nudge the new sheet when it was plotted with a shift; the wheel zooms.
      </p>
      <h3>Tabs and sessions</h3>
      <p>
        Each tab keeps its documents, annotations, zoom and undo history. Everything is saved a
        second after each change and when PDFx closes, and comes back after a restart or a crash.
        File → Save Session As stores all tabs in a .pdfxs file. When a source file was moved,
        Locate… finds it again; when another program changed it, Reload picks the new version.
      </p>
      <h3>Search</h3>
      <p>
        {MOD} + F searches all documents of the tab. Scans are recognised on the computer the first
        time you search; the language is chosen in the search bar or in Settings. Exported scans get
        the recognised text as an invisible layer, so the PDF can be searched and copied in any
        viewer (Settings → Search).
      </p>
      <h3>Updates</h3>
      <p>
        Release builds look for a new version once a day (Settings → Updates) and on Help → Check
        for Updates. The new version replaces the program folder when PDFx restarts or closes; the
        data folder stays, and the previous version can be brought back in About.
      </p>
    </div>
  )
}

function Shortcuts(): React.JSX.Element {
  return (
    <div className="help-shortcuts">
      {SHORTCUTS.map(([group, rows]) => (
        <section key={group}>
          <h3>{group}</h3>
          <table>
            <tbody>
              {rows.map(([keys, what]) => (
                <tr key={keys}>
                  <td>
                    <kbd>{keys}</kbd>
                  </td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

export function HelpDialog({
  topic,
  onClose
}: {
  topic: HelpTopic
  onClose: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState<HelpTopic>(topic)
  return (
    <Dialog title="PDFx Help" className="help-dialog" onClose={onClose}>
      <div className="help-tabs" role="tablist">
        <button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>
          Guide
        </button>
        <button className={tab === 'shortcuts' ? 'active' : ''} onClick={() => setTab('shortcuts')}>
          Keyboard shortcuts
        </button>
      </div>
      {tab === 'guide' ? <Guide /> : <Shortcuts />}
    </Dialog>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { findConverter } from '../pdfx/convert'
import { fileMeta, importIntoDocs, loadIncomingPages } from '../pdfx/source'
import { dedupeNames } from './names'
import { applyExternalDrop } from './external-drop'
import type { Collection } from './useCollection'
import type { DropTarget } from '../canvas/layout'
import type { IncomingFile, PendingImport } from './types'

export function useImport(
  collection: Collection,
  setBusy: (busy: boolean) => void,
  flash: (message: string) => void
) {
  const { setDocs, docsRef, appendPagesToDoc, insertPagesIntoDoc, spliceDocsAfter } = collection
  const { replaceDocPages } = collection
  const [pending, setPending] = useState<PendingImport[]>([])

  const addFiles = useCallback(
    async (files: IncomingFile[]) => {
      if (files.length === 0) return
      setBusy(true)
      // Every file gets a placeholder row at once; each turns into its
      // document as soon as it is read.
      const rows = files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        pageCount: null as number | null
      }))
      setPending((prev) => [...prev, ...rows])
      const failed: string[] = []
      for (const [i, file] of files.entries()) {
        const row = rows[i]
        try {
          const conv = findConverter(file.name, file.data)
          const name = conv ? conv.rename(file.name) : file.name
          const data = conv
            ? await conv.toPdf(file.name, file.data, undefined, file.path)
            : file.data
          const entries = await importIntoDocs(name, data, {
            ...fileMeta(file, !!conv),
            onPageCount: (pageCount) =>
              setPending((prev) => prev.map((p) => (p.id === row.id ? { ...p, pageCount } : p)))
          })
          setDocs((prev) => [...prev, ...dedupeNames(prev, entries)])
        } catch (error) {
          console.error(`Failed to import ${file.name}`, error)
          failed.push(file.name)
        } finally {
          setPending((prev) => prev.filter((p) => p.id !== row.id))
        }
      }
      setBusy(false)
      if (failed.length > 0) flash(`Could not open ${failed.join(', ')}`)
    },
    [flash, setBusy, setDocs]
  )

  useEffect(() => {
    const unsubscribe = window.api.onFilesOpened((files) => void addFiles(files))
    void window.api.rendererReady()
    return unsubscribe
  }, [addFiles])

  const openViaDialog = useCallback(async () => {
    await addFiles(await window.api.openFiles())
  }, [addFiles])

  const addPagesToDoc = useCallback(
    async (docId: string) => {
      const files = await window.api.openFiles()
      if (files.length === 0) return
      const doc = docsRef.current.find((d) => d.id === docId)
      if (!doc) return
      setBusy(true)
      try {
        const reference = doc.pages[doc.pages.length - 1]
        const ref = reference ? { width: reference.width, height: reference.height } : undefined
        appendPagesToDoc(docId, await loadIncomingPages(files, ref))
      } catch (error) {
        console.error('Add page failed', error)
        flash('Could not add pages')
      } finally {
        setBusy(false)
      }
    },
    [flash, setBusy, docsRef, appendPagesToDoc]
  )

  const handleExternalDropFiles = useCallback(
    async (files: IncomingFile[], target: DropTarget | null) => {
      if (files.length === 0) return
      if (docsRef.current.length === 0 || !target) {
        await addFiles(files)
        return
      }
      setBusy(true)
      try {
        await applyExternalDrop(files, target, {
          docs: docsRef.current,
          addFiles,
          insertPagesIntoDoc,
          spliceDocsAfter
        })
      } catch (error) {
        console.error('Drop failed', error)
        flash('Could not add files')
      } finally {
        setBusy(false)
      }
    },
    [addFiles, insertPagesIntoDoc, spliceDocsAfter, flash, setBusy, docsRef]
  )

  // Swap a document's pages for another file, keeping its place and name.
  const replaceDoc = useCallback(
    async (docId: string) => {
      const [file] = await window.api.openFiles()
      if (!file) return
      setBusy(true)
      try {
        const pages = await loadIncomingPages([file])
        replaceDocPages(docId, pages)
      } catch (error) {
        console.error('Replace failed', error)
        flash(`Could not open ${file.name}`)
      } finally {
        setBusy(false)
      }
    },
    [replaceDocPages, flash, setBusy]
  )

  return {
    addFiles,
    openViaDialog,
    addPagesToDoc,
    handleExternalDropFiles,
    replaceDoc,
    pendingImports: pending
  }
}

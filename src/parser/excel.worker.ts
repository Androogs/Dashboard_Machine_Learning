/// <reference lib="webworker" />
/**
 * Web Worker: procesa el Excel fuera del hilo principal para que la
 * interfaz siga fluida con bases grandes (20.000+ filas).
 */
import { parseWorkbook } from './parseWorkbook'
import type { ParsedWorkbook } from '@/types/report'

export type WorkerRequest = { buf: ArrayBuffer; docIndex: number; fileName: string }
export type WorkerResponse =
  | { type: 'progress'; step: string; pct: number }
  | { type: 'done'; result: ParsedWorkbook }
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { buf, docIndex, fileName } = e.data
  const post = (m: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
  try {
    const result = parseWorkbook(buf, docIndex, fileName, (step, pct) => post({ type: 'progress', step, pct }))
    post({ type: 'done', result })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

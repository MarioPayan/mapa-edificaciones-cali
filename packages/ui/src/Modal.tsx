import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'

export interface ModalProps {
  abierto: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
}

/** Diálogo genérico con la misma forma que la ficha (hoja inferior en teléfono). */
export function Modal({ abierto, titulo, onCerrar, children }: ModalProps) {
  return (
    <Dialog.Root open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="d-ficha-fondo" />
        <Dialog.Popup className="d-ficha">
          <div className="d-ficha__encabezado">
            <Dialog.Title className="d-ficha__direccion">{titulo}</Dialog.Title>
            <Dialog.Close className="d-ficha__cerrar" aria-label="Cerrar">
              ✕
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

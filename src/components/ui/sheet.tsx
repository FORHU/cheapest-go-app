"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { XIcon } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "@/lib/utils"

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

const SheetContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
}>({
  open: false,
  setOpen: () => { },
})

function Sheet({ open: openProp, onOpenChange, children }: SheetProps) {
  const [openState, setOpenState] = React.useState(false)
  const open = openProp !== undefined ? openProp : openState
  const setOpen = React.useCallback(
    (value: boolean) => {
      if (onOpenChange) onOpenChange(value)
      else setOpenState(value)
    },
    [onOpenChange]
  )

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false)
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [open, setOpen])

  return (
    <SheetContext.Provider value={{ open, setOpen }}>
      {children}
    </SheetContext.Provider>
  )
}

function SheetTrigger({
  children,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { setOpen } = React.useContext(SheetContext)

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: (e: React.MouseEvent) => {
        if ((children.props as any).onClick) (children.props as any).onClick(e)
        setOpen(true)
      },
      ...props
    } as any)
  }

  return (
    <button
      onClick={() => setOpen(true)}
      data-slot="sheet-trigger"
      {...props}
    >
      {children}
    </button>
  )
}

function SheetPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return mounted ? createPortal(children, document.body) : null
}

function SheetOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { setOpen } = React.useContext(SheetContext)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setOpen(false)}
      data-slot="sheet-overlay"
      className={cn(
        "absolute inset-0 bg-slate-900/40 backdrop-blur-sm",
        className
      )}
      {...(props as any)}
    />
  )
}

function SheetContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  showCloseButton?: boolean
}) {
  const { open, setOpen } = React.useContext(SheetContext)

  return (
    <AnimatePresence>
      {open && (
        <SheetPortal>
          <div className="fixed inset-0 z-[100] flex justify-end">
            <SheetOverlay />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              data-slot="sheet-content"
              className={cn(
                "relative w-full max-w-lg h-full bg-white dark:bg-obsidian shadow-2xl border-l border-slate-200 dark:border-white/10 overflow-y-auto z-[101]",
                className
              )}
              {...(props as any)}
            >
              {children}
              {showCloseButton && (
                <button
                  onClick={() => setOpen(false)}
                  className="absolute top-6 right-6 rounded-xl opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  <XIcon className="size-5" />
                  <span className="sr-only">Close</span>
                </button>
              )}
            </motion.div>
          </div>
        </SheetPortal>
      )}
    </AnimatePresence>
  )
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-6 border-b border-slate-100 dark:border-white/5", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto p-6 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row sm:justify-end gap-2", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-slot="sheet-title"
      className={cn("text-xl font-black text-slate-900 dark:text-white", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="sheet-description"
      className={cn("text-slate-400 text-sm font-medium", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/Button"

interface AlertDialogProps {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children?: React.ReactNode
}

const AlertDialogContext = React.createContext<{
    open: boolean
    setOpen: (open: boolean) => void
}>({
    open: false,
    setOpen: () => { },
})

function AlertDialog({ open: openProp, onOpenChange, children }: AlertDialogProps) {
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
        <AlertDialogContext.Provider value={{ open, setOpen }}>
            {children}
        </AlertDialogContext.Provider>
    )
}

function AlertDialogTrigger({
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const { setOpen } = React.useContext(AlertDialogContext)
    return (
        <button
            onClick={() => setOpen(true)}
            data-slot="alert-dialog-trigger"
            {...props}
        >
            {children}
        </button>
    )
}

function AlertDialogPortal({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = React.useState(false)
    React.useEffect(() => setMounted(true), [])
    return mounted ? createPortal(children, document.body) : null
}

function AlertDialogOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    const { setOpen } = React.useContext(AlertDialogContext)
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            data-slot="alert-dialog-overlay"
            className={cn(
                "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
                className
            )}
            {...(props as any)}
        />
    )
}

function AlertDialogContent({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    const { open } = React.useContext(AlertDialogContext)

    return (
        <AnimatePresence>
            {open && (
                <AlertDialogPortal>
                    <AlertDialogOverlay />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            data-slot="alert-dialog-content"
                            className={cn(
                                "pointer-events-auto relative w-full max-w-lg overflow-hidden bg-white dark:bg-obsidian rounded-xl shadow-2xl border border-slate-200 dark:border-white/10 p-6 sm:p-8",
                                className
                            )}
                            {...(props as any)}
                        >
                            {children}
                        </motion.div>
                    </div>
                </AlertDialogPortal>
            )}
        </AnimatePresence>
    )
}

function AlertDialogHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-slot="alert-dialog-header"
            className={cn(
                "flex flex-col gap-2 text-center sm:text-left",
                className
            )}
            {...props}
        />
    )
}

function AlertDialogFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-slot="alert-dialog-footer"
            className={cn(
                "flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-4",
                className
            )}
            {...props}
        />
    )
}

function AlertDialogTitle({
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2
            data-slot="alert-dialog-title"
            className={cn("text-xl font-black text-slate-900 dark:text-white", className)}
            {...props}
        />
    )
}

function AlertDialogDescription({
    className,
    ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p
            data-slot="alert-dialog-description"
            className={cn("text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed", className)}
            {...props}
        />
    )
}

function AlertDialogAction({
    className,
    children,
    onClick,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const { setOpen } = React.useContext(AlertDialogContext)
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (onClick) onClick(e)
        setOpen(false)
    }
    return (
        <button
            onClick={handleClick}
            className={cn(buttonVariants(), "rounded-lg px-6 h-11", className)}
            {...props}
        >
            {children}
        </button>
    )
}

function AlertDialogCancel({
    className,
    children,
    onClick,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const { setOpen } = React.useContext(AlertDialogContext)
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (onClick) onClick(e)
        setOpen(false)
    }
    return (
        <button
            onClick={handleClick}
            className={cn(
                buttonVariants({ variant: "outline" }),
                "rounded-lg px-6 h-11 mt-2 sm:mt-0 border-slate-200 dark:border-white/10",
                className
            )}
            {...props}
        >
            {children}
        </button>
    )
}

export {
    AlertDialog,
    AlertDialogPortal,
    AlertDialogOverlay,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    AlertDialogCancel,
}

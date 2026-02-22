"use client";

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import { MobileSearchAccordion } from './MobileSearchAccordion';

interface MobileSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    children?: React.ReactNode;
}

export const MobileSearchModal: React.FC<MobileSearchModalProps> = ({ isOpen, onClose, children }) => {
    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: '100vw',
                        height: '100dvh',
                        zIndex: 99999,
                        display: 'flex',
                        flexDirection: 'column',
                        margin: 0,
                        padding: 0,
                    }}
                    className="bg-slate-100 dark:bg-obsidian lg:hidden"
                >
                    {/* Background Sparkles */}
                    <div className="absolute inset-0 z-0 pointer-events-none opacity-30">
                        <GlobalSparkle />
                    </div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col h-full w-full">
                        {children || <MobileSearchAccordion onClose={onClose} />}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    // Use portal to render at document.body root level
    if (typeof window === 'undefined') return null;
    return createPortal(modalContent, document.body);
};

"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const FAQItem = ({ question, answer, index }: { question: string, answer: string, index: number }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5, margin: "-30px" }}
            transition={{ delay: index * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="border-b border-slate-200 dark:border-white/10 last:border-0"
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full py-4 flex items-center justify-between text-left hover:text-blue-600 transition-colors group"
            >
                <span className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">{question}</span>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="text-slate-400"
                >
                    <ChevronDown size={16} />
                </motion.div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="pb-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {answer}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

interface FAQSectionProps {
    propertyName: string;
    checkInTime?: string;
    checkOutTime?: string;
    petPolicy?: string;
}

const FAQSection: React.FC<FAQSectionProps> = ({ propertyName, checkInTime, checkOutTime, petPolicy }) => {
    // Build FAQs dynamically from real data
    const faqs: { question: string; answer: string }[] = [];

    if (checkInTime) {
        faqs.push({
            question: "What time is check-in at this property?",
            answer: checkInTime
        });
    }
    if (checkOutTime) {
        faqs.push({
            question: "What are the check-out times?",
            answer: checkOutTime
        });
    }
    if (petPolicy) {
        faqs.push({
            question: `Is ${propertyName} pet-friendly?`,
            answer: petPolicy
        });
    }

    // If no FAQs can be generated, hide the section
    if (faqs.length === 0) {
        return null;
    }

    return (
        <div className="py-8 border-t border-slate-200 dark:border-white/10" id="faqs">
            <motion.h2
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5 }}
                className="text-xl font-bold text-slate-900 dark:text-white mb-6"
            >
                Frequently asked questions
            </motion.h2>

            <div className="space-y-1">
                {faqs.map((faq, index) => (
                    <FAQItem
                        key={index}
                        index={index}
                        question={faq.question}
                        answer={faq.answer}
                    />
                ))}
            </div>
        </div>
    );
};

export default FAQSection;

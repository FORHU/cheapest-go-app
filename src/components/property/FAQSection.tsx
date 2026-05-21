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
                className="w-full py-2.5 lg:py-4 flex items-center justify-between text-left hover:text-blue-600 transition-colors group"
            >
                <span className="font-semibold text-[11px] lg:text-sm text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">{question}</span>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="text-slate-400"
                >
                    <ChevronDown size={14} />
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
                        <div className="pb-2.5 lg:pb-4 text-[11px] lg:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
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
    hotelFacilities?: string[];
    hotelImportantInformation?: string;
}

const FAQSection: React.FC<FAQSectionProps> = ({
    propertyName,
    checkInTime,
    checkOutTime,
    hotelFacilities,
    hotelImportantInformation
}) => {
    // Build FAQs dynamically from real LiteAPI data
    const faqs: { question: string; answer: string }[] = [];

    if (checkInTime) {
        faqs.push({
            question: "What time is check-in at this property?",
            answer: `Check-in time is ${checkInTime}`
        });
    }
    if (checkOutTime) {
        faqs.push({
            question: "What are the check-out times?",
            answer: `Check-out time is ${checkOutTime}`
        });
    }

    // Generate FAQs from facilities
    if (hotelFacilities && hotelFacilities.length > 0) {
        const facilitiesLower = hotelFacilities.map(f => f.toLowerCase());

        // Parking FAQ
        const hasParking = facilitiesLower.some(f =>
            f.includes('parking') || f.includes('car park')
        );
        if (hasParking) {
            const parkingFacility = hotelFacilities.find(f =>
                f.toLowerCase().includes('parking') || f.toLowerCase().includes('car park')
            );
            faqs.push({
                question: `Does ${propertyName} have parking?`,
                answer: `Yes, the property offers ${parkingFacility || 'parking facilities'}.`
            });
        }

        // WiFi FAQ
        const hasWifi = facilitiesLower.some(f =>
            f.includes('wifi') || f.includes('wi-fi') || f.includes('internet')
        );
        if (hasWifi) {
            faqs.push({
                question: `Is WiFi available at ${propertyName}?`,
                answer: "Yes, WiFi is available at the property."
            });
        }

        // Pool FAQ
        const hasPool = facilitiesLower.some(f => f.includes('pool') || f.includes('swimming'));
        if (hasPool) {
            const poolFacility = hotelFacilities.find(f =>
                f.toLowerCase().includes('pool') || f.toLowerCase().includes('swimming')
            );
            faqs.push({
                question: `Does ${propertyName} have a pool?`,
                answer: `Yes, the property has ${poolFacility || 'a swimming pool'}.`
            });
        }

        // Restaurant FAQ
        const hasRestaurant = facilitiesLower.some(f =>
            f.includes('restaurant') || f.includes('dining')
        );
        if (hasRestaurant) {
            faqs.push({
                question: `Is there a restaurant at ${propertyName}?`,
                answer: "Yes, the property has an on-site restaurant."
            });
        }
    }

    // Important information as FAQ if available
    if (hotelImportantInformation) {
        faqs.push({
            question: "Is there anything important I should know before booking?",
            answer: hotelImportantInformation
        });
    }

    // Generic fallback FAQs — always useful regardless of data availability
    if (faqs.length === 0) {
        faqs.push(
            {
                question: `What is the cancellation policy at ${propertyName}?`,
                answer: 'Cancellation policies vary by rate. Please check the room options above for specific cancellation terms before booking.'
            },
            {
                question: `Does ${propertyName} accept credit cards?`,
                answer: 'Most major credit and debit cards are accepted. Contact the property directly to confirm accepted payment methods.'
            },
            {
                question: 'How do I modify or cancel my reservation?',
                answer: 'You can manage your booking through the confirmation email you receive after booking. For urgent changes, contact the property directly.'
            }
        );
    }

    return (
        <div className="py-4 lg:py-8 border-t border-slate-200 dark:border-white/10" id="faqs">
            <motion.h2
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5 }}
                className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-2 lg:mb-6"
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

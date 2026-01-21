"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const FAQItem = ({ question, answer }: { question: string, answer: string }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-slate-200 dark:border-white/10 last:border-0">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full py-4 flex items-center justify-between text-left hover:text-blue-600 transition-colors"
            >
                <span className="font-semibold text-sm text-slate-900 dark:text-white">{question}</span>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isOpen && (
                <div className="pb-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {answer}
                </div>
            )}
        </div>
    );
};

const FAQSection = ({ propertyName }: { propertyName: string }) => {
    return (
        <div className="py-8 border-t border-slate-200 dark:border-white/10" id="faqs">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Frequently asked questions</h2>

            <div className="space-y-1">
                <FAQItem
                    question={`Is ${propertyName} pet-friendly?`}
                    answer="Yes, pets are generally allowed, but it's best to call ahead to confirm specific restrictions and fees."
                />
                <FAQItem
                    question={`How much does it cost to stay at ${propertyName}?`}
                    answer="Prices vary depending on dates and room type. You can see the current prices by entering your dates in the search bar."
                />
                <FAQItem
                    question="What time is check-in at this property?"
                    answer="The check-in time typically starts from 2:00 PM. Early check-in might be available upon request."
                />
                <FAQItem
                    question="What are the check-out times?"
                    answer="Check-out is until 12:00 PM."
                />
                <FAQItem
                    question="Is parking available?"
                    answer="Yes, free self-parking is available to guests."
                />
            </div>
        </div>
    );
};

export default FAQSection;

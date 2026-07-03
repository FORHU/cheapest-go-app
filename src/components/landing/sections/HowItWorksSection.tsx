import { useTranslations } from 'next-intl';

export function HowItWorksSection() {
    const t = useTranslations('landing.howItWorksSteps');

    const STEPS = [
        { number: '01', key: 'search' },
        { number: '02', key: 'compareStep' },
        { number: '03', key: 'bookStep' },
    ];

    return (
        <section className="w-full py-10 md:py-16 px-4 sm:px-6 bg-slate-50 dark:bg-slate-900/50">
            <div className="max-w-[1400px] mx-auto">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-2 text-center">
                    {t('howItWorks')}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mb-10 text-center max-w-xl mx-auto">
                    {t('book')} {t('bookNext')}
                </p>

                <ol className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    {STEPS.map((step) => (
                        <li key={step.number} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                            <span className="text-4xl font-extrabold text-blue-500 dark:text-blue-400 mb-3 leading-none">
                                {step.number}
                            </span>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                                {t(`${step.key}.title`)}

                            </h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                {t(`${step.key}.description`)}
                            </p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}

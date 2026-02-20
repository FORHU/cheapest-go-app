"use client";

import React from 'react';
import { Sparkles } from 'lucide-react';
import { SectionHeader, HorizontalScroll } from '@/components/ui';
import { PropertyCard } from '@/components/shared';
import { weekendDeals } from '@/data';

export const LastMinuteWeekendDeals: React.FC = () => {
  return (
    <section className="w-full py-6 sm:py-10">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Flash Getaways"
          subtitle="Limited-time offers on premium stays"
          badge={{ icon: <Sparkles size={14} />, text: 'Hot Deals', variant: 'amber' }}
          actionLabel="See all deals"
          actionHref="/deals"
        />

        <HorizontalScroll gap={4} scrollAmount={320}>
          {weekendDeals.map((deal, i) => (
            <div
              key={deal.id}
              className="flex-shrink-0 w-[48vw] min-w-[200px] max-w-[280px] sm:min-w-[220px] sm:max-w-[320px] snap-start"
            >
              <PropertyCard
                image={deal.image}
                name={deal.name}
                location={deal.location}
                rating={deal.rating}
                reviews={deal.reviews}
                originalPrice={deal.originalPrice}
                price={deal.salePrice}
                badge={deal.badge}
                badgeColor="green"
                index={i}
              />
            </div>
          ))}
        </HorizontalScroll>
      </div>
    </section>
  );
};

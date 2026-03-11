"use client";

import React from 'react';
import { Sparkles } from 'lucide-react';
import { SectionHeader, HorizontalScroll } from '@/components/ui';
import { PropertyCard } from '@/components/shared';
import { type WeekendDeal } from '@/types';

export const LastMinuteWeekendDeals: React.FC<{ deals?: WeekendDeal[] }> = ({ deals }) => {
  const displayDeals = deals || [];
  return (
    <section className="w-full py-4 md:py-8 lg:py-10 landscape-compact-py">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Flash Getaways"
          subtitle="Limited-time offers on premium stays"
          badge={{ icon: <Sparkles size={14} />, text: 'Hot Deals', variant: 'amber' }}
          actionHref="/deals"
        />

        <HorizontalScroll gap={4} scrollAmount={320}>
          {displayDeals.map((deal: WeekendDeal, i: number) => (
            <div
              key={deal.id}
              className="flex-shrink-0 w-[220px] sm:w-[260px] md:w-[320px] landscape-compact-card snap-start flex flex-col"
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
                className="h-full flex flex-col flex-1"
              />
            </div>
          ))}
        </HorizontalScroll>
      </div>
    </section>
  );
};

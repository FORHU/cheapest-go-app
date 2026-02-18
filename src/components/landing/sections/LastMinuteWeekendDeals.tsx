"use client";

import React from 'react';
import { Sparkles } from 'lucide-react';
import { SectionHeader } from '@/components/ui';
import { PropertyCard } from '@/components/shared';
import { weekendDeals } from '@/data';

export const LastMinuteWeekendDeals: React.FC = () => {
  return (
    <section className="w-full py-8 sm:py-12">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Flash Getaways"
          subtitle="Limited-time offers on premium stays"
          badge={{ icon: <Sparkles size={14} />, text: 'Hot Deals', variant: 'amber' }}
          actionLabel="See all deals"
          actionHref="/deals"
        />


        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-5">
          {weekendDeals.map((deal, i) => (
            <PropertyCard
              key={deal.id}
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
          ))}
        </div>
      </div>
    </section>
  );
};

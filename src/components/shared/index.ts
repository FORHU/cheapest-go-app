// Shared components index
// Centralized exports for reusable components

// PropertyCard - Unified property display component
export { PropertyCard } from './PropertyCard';
export type { PropertyCardProps, PropertyCardVariant } from './PropertyCard';

// RatingBadge - Rating display with label and reviews
export { RatingBadge } from './RatingBadge';
export type { RatingBadgeProps, RatingBadgeSize, RatingBadgeVariant } from './RatingBadge';

// AmenitiesList - Amenities display with icons
export { AmenitiesList } from './AmenitiesList';
export type { AmenitiesListProps, AmenitiesVariant } from './AmenitiesList';

// Skeleton - Loading skeleton components
export {
    Skeleton,
    SkeletonText,
    SkeletonCircle,
    SkeletonImage,
    PropertyCardSkeleton,
    RoomCardSkeleton,
} from './Skeleton';
export type {
    SkeletonProps,
    PropertyCardSkeletonProps,
    RoomCardSkeletonProps,
} from './Skeleton';

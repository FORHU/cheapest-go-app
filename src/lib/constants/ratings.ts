export const STAR_RATINGS = [5, 4, 3, 2, 1] as const;

export const GUEST_RATING_OPTIONS = [
    { value: 0, label: 'Any' },
    { value: 9, label: 'Excellent 9+' },
    { value: 8, label: 'Very Good 8+' },
    { value: 7, label: 'Good 7+' },
    { value: 6, label: 'Pleasant 6+' },
] as const;

export const REVIEW_COUNT_OPTIONS = [
    { value: 0, label: 'Any' },
    { value: 10, label: '10+ reviews' },
    { value: 50, label: '50+ reviews' },
    { value: 100, label: '100+ reviews' },
    { value: 500, label: '500+ reviews' },
] as const;

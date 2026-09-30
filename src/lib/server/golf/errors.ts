/** Another course already uses this slug. Kept apart from courses.ts so tests can mock that module. */
export class SlugTakenError extends Error {
    constructor(public readonly slug: string) {
        super(`The slug "${slug}" is already used by another course`);
        this.name = 'SlugTakenError';
    }
}

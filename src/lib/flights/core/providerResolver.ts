import type { IFlightProvider } from '../providers/flightProvider.interface';
import { AmadeusProvider } from '../providers/amadeusProvider';
import { MystiflyProvider } from '../providers/mystiflyProvider';

// ─── Provider Toggle Map ─────────────────────────────────────────────

export interface ProviderToggle {
    enabled: boolean;
    /** Override the provider's built-in priority (lower = queried first) */
    priority?: number;
}

export type ProviderMap = Record<string, ProviderToggle>;

// Default configuration — change these at runtime via resolverInstance.set()
const DEFAULT_PROVIDER_MAP: ProviderMap = {
    amadeus: { enabled: true, priority: 1 },
    mystifly: { enabled: true, priority: 2 },
};

// ─── Provider Factory ────────────────────────────────────────────────

// Maps provider name → constructor.
// Add new providers here when integrating a new source.
const PROVIDER_FACTORIES: Record<string, () => IFlightProvider> = {
    amadeus: () => new AmadeusProvider(),
    mystifly: () => new MystiflyProvider(),
};

// ─── Resolver ────────────────────────────────────────────────────────

export class ProviderResolver {
    private map: ProviderMap;

    constructor(initialMap?: ProviderMap) {
        this.map = { ...(initialMap ?? DEFAULT_PROVIDER_MAP) };
    }

    // Get the current toggle map (copy).
    getMap(): ProviderMap {
        return { ...this.map };
    }

    // Check if a specific provider is active.
    isActive(name: string): boolean {
        return this.map[name]?.enabled ?? false;
    }

    // Enable a provider at runtime.
    enable(name: string, priority?: number): void {
        this.map[name] = { enabled: true, priority: priority ?? this.map[name]?.priority };
    }

    // Disable a provider at runtime.
    disable(name: string): void {
        if (this.map[name]) {
            this.map[name] = { ...this.map[name], enabled: false };
        }
    }

    // Replace the entire toggle map at runtime.
    setMap(map: ProviderMap): void {
        this.map = { ...map };
    }

    // Instantiate all active providers and return them ready for engine registration.
    // Only providers that are both toggled on AND self-report as enabled (credentials present) are returned.
    resolve(): IFlightProvider[] {
        const active: IFlightProvider[] = [];

        const entries = Object.entries(this.map);
        for (const [name, toggle] of entries) {
            if (!toggle.enabled) continue;

            const factory = PROVIDER_FACTORIES[name];
            if (!factory) {
                console.warn(`[ProviderResolver] Unknown provider: ${name}`);
                continue;
            }

            const instance = factory();

            if (!instance.enabled) {
                console.log(`[ProviderResolver] ${name} toggled on but self-disabled (missing credentials)`);
                continue;
            }

            active.push(instance);
        }

        // Sort by priority
        active.sort((a, b) => {
            const pa = this.map[a.name]?.priority ?? a.priority ?? 50;
            const pb = this.map[b.name]?.priority ?? b.priority ?? 50;
            return pa - pb;
        });

        return active;
    }
}

// ─── Singleton ───────────────────────────────────────────────────────

export const providerResolver = new ProviderResolver();

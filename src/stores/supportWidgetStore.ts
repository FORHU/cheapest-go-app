import { create } from 'zustand';

/**
 * Whether the support panel is open.
 *
 * The widget owns its own launcher, so this exists for the *other* ways into support —
 * the "Live Chat" row in Account → Help, and anywhere else that offers to start a
 * conversation. Those live in a different part of the tree from the widget, which is
 * portalled to `document.body` from the customer layout, so there is no ancestor either
 * could share a `useState` through.
 *
 * Deliberately only open/closed: the conversation itself stays in `useSupportChat`,
 * inside the widget, where the stream that feeds it is held.
 */
interface SupportWidgetState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

export const useSupportWidgetStore = create<SupportWidgetState>((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));

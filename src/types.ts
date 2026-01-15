import { ReactNode } from 'react';

export interface BaseProps {
  children?: ReactNode;
  className?: string;
}

export interface TelemetryData {
  label: string;
  value: string;
  subValue: string;
  trend: 'up' | 'down' | 'stable';
  icon: 'chart' | 'plane' | 'sun';
}

export interface Destination {
  id: string;
  name: string;
  coords: string;
  price: number;
  image: string;
  tag?: string;
}

export type Theme = 'dark' | 'light';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

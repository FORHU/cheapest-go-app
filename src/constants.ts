import { Destination, TelemetryData } from "./types";

export const TELEMETRY_DATA: TelemetryData[] = [
  {
    label: "Market Watch",
    value: "$842",
    subValue: "-12.4%",
    trend: "down",
    icon: "chart"
  },
  {
    label: "Active Trip",
    value: "London (LHR)",
    subValue: "Flight BA0178",
    trend: "stable",
    icon: "plane"
  },
  {
    label: "Weather Uplink",
    value: "72°",
    subValue: "San Francisco",
    trend: "stable",
    icon: "sun"
  }
];

export const DESTINATIONS: Destination[] = [
  {
    id: "1",
    name: "Swiss Alps",
    coords: "46.8182° N",
    price: 1240,
    image: "https://picsum.photos/800/600?random=1",
    tag: "Trending Destination"
  },
  {
    id: "2",
    name: "Tokyo",
    coords: "35.6762° N",
    price: 890,
    image: "https://picsum.photos/800/600?random=2"
  },
  {
    id: "3",
    name: "Paris",
    coords: "48.8566° N",
    price: 650,
    image: "https://picsum.photos/800/600?random=3"
  },
  {
    id: "4",
    name: "Miami",
    coords: "25.7617° N",
    price: 230,
    image: "https://picsum.photos/800/600?random=4"
  },
  {
    id: "5",
    name: "Dubai",
    coords: "25.2048° N",
    price: 1100,
    image: "https://picsum.photos/800/600?random=5"
  }
];
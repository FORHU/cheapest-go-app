/**
 * TravelgateX hotel search — core logic, no HTTP layer.
 * Called directly by server routes to avoid HTTP self-call overhead.
 */

import { tgxGraphQL, getTgxSettings, getTgxConfig, buildOccupancies, normalizeOption, type TgxOption } from './client';
import { getSqlAdmin } from '@/lib/db/postgres';
import { resolveTgxDestinationCode } from '@/lib/server/search';
import { otvCodeToLabel } from './amenityCodes';
import { getSeedCodesForCity } from './hotel-seeds';

// ─── Country bounding boxes for geographic hotel filtering ───────────────────
// Used to reject OTV portfolio hotels that are in the wrong country.
// Bounding boxes are intentionally generous (±2° buffer) to avoid false negatives.
// Hotels with lat=0/lng=0 (no OTV coordinates) are always kept regardless.
const COUNTRY_BBOX: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
    // ── Asia-Pacific ──────────────────────────────────────────────────────────
    TH: { minLat: 3.6,   maxLat: 22.5,  minLng: 95.3,   maxLng: 107.7  },
    ID: { minLat: -13.0, maxLat: 7.9,   minLng: 93.0,   maxLng: 143.0  },
    JP: { minLat: 22.0,  maxLat: 47.5,  minLng: 120.9,  maxLng: 147.8  },
    PH: { minLat: 4.6,   maxLat: 21.1,  minLng: 116.9,  maxLng: 128.0  },
    SG: { minLat: 1.1,   maxLat: 1.6,   minLng: 103.6,  maxLng: 104.1  },
    MY: { minLat: -0.2,  maxLat: 8.5,   minLng: 99.6,   maxLng: 119.5  },
    VN: { minLat: 8.2,   maxLat: 23.4,  minLng: 102.1,  maxLng: 109.5  },
    KH: { minLat: 9.4,   maxLat: 14.7,  minLng: 102.3,  maxLng: 107.6  },
    LA: { minLat: 13.9,  maxLat: 22.5,  minLng: 100.1,  maxLng: 107.7  },
    MM: { minLat: 9.8,   maxLat: 28.5,  minLng: 92.2,   maxLng: 101.2  },
    BN: { minLat: 4.0,   maxLat: 5.1,   minLng: 114.1,  maxLng: 115.4  },
    TL: { minLat: -9.5,  maxLat: -8.1,  minLng: 124.0,  maxLng: 127.3  },
    IN: { minLat: 6.7,   maxLat: 37.1,  minLng: 68.2,   maxLng: 97.4   },
    PK: { minLat: 23.6,  maxLat: 37.1,  minLng: 60.9,   maxLng: 77.1   },
    BD: { minLat: 20.7,  maxLat: 26.6,  minLng: 88.0,   maxLng: 92.7   },
    LK: { minLat: 5.9,   maxLat: 9.8,   minLng: 79.7,   maxLng: 81.9   },
    NP: { minLat: 26.3,  maxLat: 30.4,  minLng: 80.1,   maxLng: 88.2   },
    BT: { minLat: 26.7,  maxLat: 28.3,  minLng: 88.8,   maxLng: 92.1   },
    MV: { minLat: -1.0,  maxLat: 7.1,   minLng: 72.7,   maxLng: 73.8   },
    AF: { minLat: 29.4,  maxLat: 38.5,  minLng: 60.5,   maxLng: 74.9   },
    CN: { minLat: 18.2,  maxLat: 53.6,  minLng: 73.5,   maxLng: 134.8  },
    HK: { minLat: 22.1,  maxLat: 22.6,  minLng: 113.8,  maxLng: 114.5  },
    MO: { minLat: 22.1,  maxLat: 22.2,  minLng: 113.5,  maxLng: 113.6  },
    TW: { minLat: 21.9,  maxLat: 25.3,  minLng: 119.9,  maxLng: 122.1  },
    KR: { minLat: 33.1,  maxLat: 38.6,  minLng: 125.1,  maxLng: 130.9  },
    KP: { minLat: 37.7,  maxLat: 42.5,  minLng: 124.3,  maxLng: 130.7  },
    MN: { minLat: 41.6,  maxLat: 52.1,  minLng: 87.8,   maxLng: 119.9  },
    AU: { minLat: -43.7, maxLat: -10.7, minLng: 113.2,  maxLng: 153.6  },
    NZ: { minLat: -47.3, maxLat: -34.4, minLng: 166.4,  maxLng: 178.6  },
    PG: { minLat: -11.7, maxLat: -1.3,  minLng: 141.0,  maxLng: 155.7  },
    SB: { minLat: -11.9, maxLat: -5.0,  minLng: 155.5,  maxLng: 166.9  },
    VU: { minLat: -20.3, maxLat: -13.1, minLng: 166.5,  maxLng: 170.2  },
    FJ: { minLat: -20.7, maxLat: -12.5, minLng: 177.0,  maxLng: 180.0  },
    WS: { minLat: -14.1, maxLat: -13.4, minLng: -172.8, maxLng: -171.4 },
    TO: { minLat: -22.4, maxLat: -15.6, minLng: -175.4, maxLng: -173.7 },
    FM: { minLat: 1.0,   maxLat: 10.1,  minLng: 138.0,  maxLng: 163.1  },
    PW: { minLat: 2.8,   maxLat: 8.1,   minLng: 131.1,  maxLng: 134.7  },
    MH: { minLat: 4.6,   maxLat: 14.7,  minLng: 160.8,  maxLng: 172.0  },
    // ── Middle East ───────────────────────────────────────────────────────────
    AE: { minLat: 22.6,  maxLat: 26.1,  minLng: 51.6,   maxLng: 56.4   },
    SA: { minLat: 16.4,  maxLat: 32.2,  minLng: 36.5,   maxLng: 55.7   },
    QA: { minLat: 24.5,  maxLat: 26.2,  minLng: 50.7,   maxLng: 51.7   },
    BH: { minLat: 25.8,  maxLat: 26.4,  minLng: 50.3,   maxLng: 50.8   },
    KW: { minLat: 28.5,  maxLat: 30.1,  minLng: 46.5,   maxLng: 48.4   },
    OM: { minLat: 16.6,  maxLat: 26.4,  minLng: 51.9,   maxLng: 59.9   },
    YE: { minLat: 12.1,  maxLat: 19.0,  minLng: 42.6,   maxLng: 54.7   },
    JO: { minLat: 29.2,  maxLat: 33.4,  minLng: 34.9,   maxLng: 39.3   },
    IL: { minLat: 29.5,  maxLat: 33.3,  minLng: 34.3,   maxLng: 35.9   },
    PS: { minLat: 31.2,  maxLat: 32.6,  minLng: 34.2,   maxLng: 35.6   },
    LB: { minLat: 33.1,  maxLat: 34.7,  minLng: 35.1,   maxLng: 36.6   },
    SY: { minLat: 32.3,  maxLat: 37.3,  minLng: 35.7,   maxLng: 42.4   },
    IQ: { minLat: 29.1,  maxLat: 37.4,  minLng: 38.8,   maxLng: 48.6   },
    IR: { minLat: 25.1,  maxLat: 39.8,  minLng: 44.0,   maxLng: 63.3   },
    // ── Central Asia ─────────────────────────────────────────────────────────
    KZ: { minLat: 40.6,  maxLat: 55.4,  minLng: 50.3,   maxLng: 87.4   },
    UZ: { minLat: 37.2,  maxLat: 45.6,  minLng: 56.0,   maxLng: 73.2   },
    TM: { minLat: 35.1,  maxLat: 42.8,  minLng: 52.5,   maxLng: 66.7   },
    TJ: { minLat: 36.7,  maxLat: 41.0,  minLng: 67.4,   maxLng: 75.2   },
    KG: { minLat: 39.2,  maxLat: 43.2,  minLng: 69.3,   maxLng: 80.3   },
    // ── Caucasus ─────────────────────────────────────────────────────────────
    GE: { minLat: 41.0,  maxLat: 43.6,  minLng: 40.0,   maxLng: 46.7   },
    AM: { minLat: 38.8,  maxLat: 41.3,  minLng: 43.4,   maxLng: 46.6   },
    AZ: { minLat: 38.4,  maxLat: 41.9,  minLng: 44.8,   maxLng: 50.4   },
    // ── Eastern Europe ────────────────────────────────────────────────────────
    RU: { minLat: 41.2,  maxLat: 81.9,  minLng: 19.6,   maxLng: 180.0  },
    UA: { minLat: 44.4,  maxLat: 52.4,  minLng: 22.1,   maxLng: 40.2   },
    BY: { minLat: 51.3,  maxLat: 56.2,  minLng: 23.2,   maxLng: 32.8   },
    MD: { minLat: 45.5,  maxLat: 48.5,  minLng: 26.6,   maxLng: 30.2   },
    RO: { minLat: 43.6,  maxLat: 48.3,  minLng: 20.3,   maxLng: 29.7   },
    BG: { minLat: 41.2,  maxLat: 44.2,  minLng: 22.4,   maxLng: 28.6   },
    RS: { minLat: 42.2,  maxLat: 46.2,  minLng: 18.8,   maxLng: 23.0   },
    XK: { minLat: 41.9,  maxLat: 43.3,  minLng: 20.0,   maxLng: 21.8   },
    BA: { minLat: 42.6,  maxLat: 45.3,  minLng: 15.7,   maxLng: 19.6   },
    ME: { minLat: 41.9,  maxLat: 43.6,  minLng: 18.5,   maxLng: 20.4   },
    HR: { minLat: 42.4,  maxLat: 46.6,  minLng: 13.5,   maxLng: 19.4   },
    SI: { minLat: 45.4,  maxLat: 46.9,  minLng: 13.4,   maxLng: 16.6   },
    MK: { minLat: 40.9,  maxLat: 42.4,  minLng: 20.5,   maxLng: 23.0   },
    AL: { minLat: 39.6,  maxLat: 42.7,  minLng: 19.3,   maxLng: 21.1   },
    SK: { minLat: 47.7,  maxLat: 49.6,  minLng: 16.8,   maxLng: 22.6   },
    PL: { minLat: 49.0,  maxLat: 54.8,  minLng: 14.1,   maxLng: 24.1   },
    CZ: { minLat: 48.5,  maxLat: 51.1,  minLng: 12.1,   maxLng: 18.9   },
    HU: { minLat: 45.7,  maxLat: 48.6,  minLng: 16.1,   maxLng: 22.9   },
    EE: { minLat: 57.5,  maxLat: 59.7,  minLng: 21.8,   maxLng: 28.2   },
    LV: { minLat: 55.7,  maxLat: 58.1,  minLng: 21.0,   maxLng: 28.2   },
    LT: { minLat: 53.9,  maxLat: 56.5,  minLng: 20.9,   maxLng: 26.8   },
    // ── Northern & Western Europe ─────────────────────────────────────────────
    GB: { minLat: 49.9,  maxLat: 60.8,  minLng: -8.6,   maxLng: 1.8    },
    IE: { minLat: 51.4,  maxLat: 55.4,  minLng: -10.5,  maxLng: -6.0   },
    NO: { minLat: 57.9,  maxLat: 71.2,  minLng: 4.5,    maxLng: 31.1   },
    SE: { minLat: 55.3,  maxLat: 69.1,  minLng: 10.6,   maxLng: 24.2   },
    DK: { minLat: 54.6,  maxLat: 57.8,  minLng: 8.1,    maxLng: 15.2   },
    FI: { minLat: 59.8,  maxLat: 70.1,  minLng: 19.1,   maxLng: 31.6   },
    IS: { minLat: 63.3,  maxLat: 66.6,  minLng: -24.5,  maxLng: -13.5  },
    DE: { minLat: 47.3,  maxLat: 55.1,  minLng: 5.9,    maxLng: 15.0   },
    NL: { minLat: 50.7,  maxLat: 53.6,  minLng: 3.3,    maxLng: 7.3    },
    BE: { minLat: 49.5,  maxLat: 51.5,  minLng: 2.5,    maxLng: 6.4    },
    LU: { minLat: 49.4,  maxLat: 50.2,  minLng: 5.7,    maxLng: 6.5    },
    FR: { minLat: 41.3,  maxLat: 51.1,  minLng: -5.2,   maxLng: 9.6    },
    CH: { minLat: 45.8,  maxLat: 47.8,  minLng: 5.9,    maxLng: 10.5   },
    AT: { minLat: 46.4,  maxLat: 49.0,  minLng: 9.5,    maxLng: 17.2   },
    LI: { minLat: 47.0,  maxLat: 47.3,  minLng: 9.5,    maxLng: 9.6    },
    // ── Southern Europe ───────────────────────────────────────────────────────
    ES: { minLat: 27.6,  maxLat: 43.8,  minLng: -18.2,  maxLng: 4.3    },
    PT: { minLat: 29.8,  maxLat: 42.2,  minLng: -31.3,  maxLng: -6.2   },
    IT: { minLat: 36.6,  maxLat: 47.1,  minLng: 6.7,    maxLng: 18.5   },
    MT: { minLat: 35.8,  maxLat: 36.1,  minLng: 14.2,   maxLng: 14.6   },
    GR: { minLat: 34.8,  maxLat: 41.8,  minLng: 19.4,   maxLng: 29.6   },
    CY: { minLat: 34.6,  maxLat: 35.7,  minLng: 32.3,   maxLng: 34.6   },
    TR: { minLat: 35.8,  maxLat: 42.1,  minLng: 25.7,   maxLng: 44.8   },
    AD: { minLat: 42.4,  maxLat: 42.7,  minLng: 1.4,    maxLng: 1.8    },
    SM: { minLat: 43.9,  maxLat: 44.0,  minLng: 12.4,   maxLng: 12.5   },
    // ── North Africa ──────────────────────────────────────────────────────────
    MA: { minLat: 27.7,  maxLat: 35.9,  minLng: -13.2,  maxLng: -1.0   },
    DZ: { minLat: 18.9,  maxLat: 37.1,  minLng: -8.7,   maxLng: 12.0   },
    TN: { minLat: 30.2,  maxLat: 37.5,  minLng: 7.5,    maxLng: 11.6   },
    LY: { minLat: 19.5,  maxLat: 33.2,  minLng: 9.4,    maxLng: 25.2   },
    EG: { minLat: 22.0,  maxLat: 31.7,  minLng: 24.7,   maxLng: 37.0   },
    SD: { minLat: 9.3,   maxLat: 22.2,  minLng: 21.9,   maxLng: 38.6   },
    // ── West Africa ───────────────────────────────────────────────────────────
    MR: { minLat: 14.7,  maxLat: 27.3,  minLng: -17.1,  maxLng: -4.8   },
    ML: { minLat: 10.1,  maxLat: 25.0,  minLng: -12.2,  maxLng: 4.3    },
    SN: { minLat: 12.3,  maxLat: 16.7,  minLng: -17.5,  maxLng: -11.4  },
    GM: { minLat: 13.1,  maxLat: 13.8,  minLng: -16.8,  maxLng: -13.8  },
    GW: { minLat: 11.0,  maxLat: 12.7,  minLng: -16.7,  maxLng: -13.6  },
    GN: { minLat: 7.2,   maxLat: 12.7,  minLng: -15.1,  maxLng: -7.6   },
    SL: { minLat: 6.9,   maxLat: 10.0,  minLng: -13.3,  maxLng: -10.3  },
    LR: { minLat: 4.4,   maxLat: 8.6,   minLng: -11.5,  maxLng: -7.4   },
    CI: { minLat: 4.3,   maxLat: 10.7,  minLng: -8.6,   maxLng: -2.5   },
    GH: { minLat: 4.7,   maxLat: 11.2,  minLng: -3.3,   maxLng: 1.2    },
    BF: { minLat: 9.4,   maxLat: 15.1,  minLng: -5.5,   maxLng: 2.4    },
    TG: { minLat: 6.1,   maxLat: 11.1,  minLng: -0.1,   maxLng: 1.8    },
    BJ: { minLat: 6.2,   maxLat: 12.4,  minLng: 0.8,    maxLng: 3.9    },
    NE: { minLat: 11.7,  maxLat: 23.5,  minLng: 0.2,    maxLng: 16.0   },
    NG: { minLat: 4.3,   maxLat: 13.9,  minLng: 2.7,    maxLng: 14.7   },
    CV: { minLat: 14.8,  maxLat: 17.2,  minLng: -25.4,  maxLng: -22.7  },
    // ── Central Africa ────────────────────────────────────────────────────────
    CM: { minLat: 1.7,   maxLat: 13.1,  minLng: 8.5,    maxLng: 16.2   },
    TD: { minLat: 7.4,   maxLat: 23.5,  minLng: 13.5,   maxLng: 24.0   },
    CF: { minLat: 2.2,   maxLat: 11.0,  minLng: 14.4,   maxLng: 27.5   },
    GQ: { minLat: -1.5,  maxLat: 3.8,   minLng: 5.6,    maxLng: 11.3   },
    GA: { minLat: -3.9,  maxLat: 2.3,   minLng: 8.7,    maxLng: 14.5   },
    CG: { minLat: -5.1,  maxLat: 3.7,   minLng: 11.2,   maxLng: 18.6   },
    CD: { minLat: -13.5, maxLat: 5.3,   minLng: 12.2,   maxLng: 31.3   },
    ST: { minLat: -0.1,  maxLat: 1.7,   minLng: 6.5,    maxLng: 7.5    },
    // ── East Africa ───────────────────────────────────────────────────────────
    ET: { minLat: 3.4,   maxLat: 15.0,  minLng: 33.0,   maxLng: 47.9   },
    ER: { minLat: 12.4,  maxLat: 18.0,  minLng: 36.4,   maxLng: 43.1   },
    DJ: { minLat: 10.9,  maxLat: 12.7,  minLng: 41.8,   maxLng: 43.4   },
    SO: { minLat: -1.7,  maxLat: 12.0,  minLng: 40.9,   maxLng: 51.4   },
    KE: { minLat: -4.7,  maxLat: 4.6,   minLng: 33.9,   maxLng: 41.9   },
    UG: { minLat: -1.5,  maxLat: 4.2,   minLng: 29.6,   maxLng: 35.0   },
    TZ: { minLat: -11.7, maxLat: -1.0,  minLng: 29.3,   maxLng: 40.4   },
    RW: { minLat: -2.8,  maxLat: -1.1,  minLng: 29.0,   maxLng: 30.9   },
    BI: { minLat: -4.5,  maxLat: -2.3,  minLng: 29.0,   maxLng: 30.9   },
    SS: { minLat: 3.5,   maxLat: 12.2,  minLng: 24.1,   maxLng: 36.9   },
    MG: { minLat: -25.6, maxLat: -11.9, minLng: 43.2,   maxLng: 50.5   },
    MU: { minLat: -20.5, maxLat: -10.3, minLng: 56.5,   maxLng: 63.5   },
    SC: { minLat: -9.8,  maxLat: -3.7,  minLng: 46.2,   maxLng: 56.3   },
    // ── Southern Africa ───────────────────────────────────────────────────────
    AO: { minLat: -18.0, maxLat: -4.4,  minLng: 11.7,   maxLng: 24.1   },
    ZM: { minLat: -18.1, maxLat: -8.2,  minLng: 21.9,   maxLng: 33.7   },
    ZW: { minLat: -22.4, maxLat: -15.6, minLng: 25.2,   maxLng: 33.1   },
    MW: { minLat: -17.1, maxLat: -9.4,  minLng: 32.7,   maxLng: 35.9   },
    MZ: { minLat: -26.9, maxLat: -10.5, minLng: 32.3,   maxLng: 40.8   },
    NA: { minLat: -29.0, maxLat: -16.9, minLng: 11.7,   maxLng: 25.3   },
    BW: { minLat: -26.9, maxLat: -17.8, minLng: 19.9,   maxLng: 29.4   },
    ZA: { minLat: -34.8, maxLat: -22.1, minLng: 16.5,   maxLng: 32.9   },
    LS: { minLat: -30.7, maxLat: -28.6, minLng: 27.0,   maxLng: 29.5   },
    SZ: { minLat: -27.3, maxLat: -25.7, minLng: 30.8,   maxLng: 32.1   },
    // ── North America ─────────────────────────────────────────────────────────
    CA: { minLat: 41.7,  maxLat: 83.1,  minLng: -141.0, maxLng: -52.6  },
    US: { minLat: 18.9,  maxLat: 71.4,  minLng: -179.1, maxLng: -66.9  },
    MX: { minLat: 14.5,  maxLat: 32.7,  minLng: -117.1, maxLng: -86.7  },
    GT: { minLat: 13.7,  maxLat: 17.8,  minLng: -92.2,  maxLng: -88.2  },
    BZ: { minLat: 15.9,  maxLat: 18.5,  minLng: -89.2,  maxLng: -87.8  },
    HN: { minLat: 13.0,  maxLat: 16.5,  minLng: -89.4,  maxLng: -83.2  },
    SV: { minLat: 13.1,  maxLat: 14.5,  minLng: -90.1,  maxLng: -87.7  },
    NI: { minLat: 10.7,  maxLat: 15.0,  minLng: -87.7,  maxLng: -82.6  },
    CR: { minLat: 8.0,   maxLat: 11.2,  minLng: -85.9,  maxLng: -82.6  },
    PA: { minLat: 7.2,   maxLat: 9.6,   minLng: -83.1,  maxLng: -77.2  },
    CU: { minLat: 19.8,  maxLat: 23.3,  minLng: -84.9,  maxLng: -74.1  },
    JM: { minLat: 17.7,  maxLat: 18.5,  minLng: -78.4,  maxLng: -76.2  },
    HT: { minLat: 18.0,  maxLat: 20.1,  minLng: -74.5,  maxLng: -71.6  },
    DO: { minLat: 17.5,  maxLat: 20.0,  minLng: -72.0,  maxLng: -68.3  },
    BS: { minLat: 20.9,  maxLat: 27.3,  minLng: -80.5,  maxLng: -72.7  },
    TT: { minLat: 10.0,  maxLat: 11.4,  minLng: -61.9,  maxLng: -60.5  },
    BB: { minLat: 13.0,  maxLat: 13.3,  minLng: -59.7,  maxLng: -59.4  },
    LC: { minLat: 13.7,  maxLat: 14.1,  minLng: -61.1,  maxLng: -60.9  },
    VC: { minLat: 12.6,  maxLat: 13.4,  minLng: -61.5,  maxLng: -61.1  },
    GD: { minLat: 12.0,  maxLat: 12.3,  minLng: -61.8,  maxLng: -61.6  },
    DM: { minLat: 15.2,  maxLat: 15.6,  minLng: -61.5,  maxLng: -61.2  },
    AG: { minLat: 16.9,  maxLat: 17.7,  minLng: -61.9,  maxLng: -61.7  },
    KN: { minLat: 17.1,  maxLat: 17.4,  minLng: -62.9,  maxLng: -62.5  },
    // ── South America ─────────────────────────────────────────────────────────
    CO: { minLat: -4.2,  maxLat: 12.5,  minLng: -79.0,  maxLng: -66.8  },
    VE: { minLat: 0.6,   maxLat: 12.5,  minLng: -73.4,  maxLng: -59.8  },
    GY: { minLat: 1.2,   maxLat: 8.6,   minLng: -61.4,  maxLng: -56.5  },
    SR: { minLat: 1.8,   maxLat: 6.0,   minLng: -58.1,  maxLng: -53.9  },
    BR: { minLat: -33.8, maxLat: 5.3,   minLng: -73.9,  maxLng: -34.8  },
    EC: { minLat: -5.0,  maxLat: 1.4,   minLng: -81.0,  maxLng: -75.2  },
    PE: { minLat: -18.3, maxLat: -0.0,  minLng: -81.4,  maxLng: -68.7  },
    BO: { minLat: -22.9, maxLat: -9.7,  minLng: -69.7,  maxLng: -57.5  },
    CL: { minLat: -55.9, maxLat: -17.5, minLng: -75.7,  maxLng: -66.4  },
    PY: { minLat: -27.6, maxLat: -19.3, minLng: -62.7,  maxLng: -54.3  },
    AR: { minLat: -55.1, maxLat: -21.8, minLng: -73.6,  maxLng: -53.6  },
    UY: { minLat: -34.9, maxLat: -30.1, minLng: -58.4,  maxLng: -53.1  },
};

// ── City-level bounding boxes ─────────────────────────────────────────────────
// Used by the OTV portfolio city filter to exclude hotels from other cities in
// the same country. Coordinate-based to avoid language issues (OTV may use local
// city names like "서울" instead of "Seoul"). Hotels whose OTV coordinates fall
// outside the city bbox are excluded; hotels with no coordinates are kept.
// Keys are lowercase English city names matching the cityName search parameter.
const CITY_BBOX: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
    // ── Japan ─────────────────────────────────────────────────────────────────
    tokyo:       { minLat: 35.4,  maxLat: 35.95, minLng: 138.9, maxLng: 140.0  }, // Greater Tokyo incl. Yokohama
    osaka:       { minLat: 34.4,  maxLat: 34.85, minLng: 135.3, maxLng: 135.75 },
    kyoto:       { minLat: 34.85, maxLat: 35.15, minLng: 135.55, maxLng: 135.95 },
    sapporo:     { minLat: 42.9,  maxLat: 43.3,  minLng: 141.1, maxLng: 141.5  },
    fukuoka:     { minLat: 33.4,  maxLat: 33.75, minLng: 130.2, maxLng: 130.6  },
    nara:        { minLat: 34.55, maxLat: 34.8,  minLng: 135.7, maxLng: 136.0  },
    hiroshima:   { minLat: 34.2,  maxLat: 34.55, minLng: 132.3, maxLng: 132.7  },
    // ── South Korea ───────────────────────────────────────────────────────────
    seoul:       { minLat: 37.3,  maxLat: 37.75, minLng: 126.7, maxLng: 127.3  },
    busan:       { minLat: 34.9,  maxLat: 35.4,  minLng: 128.8, maxLng: 129.3  },
    jeju:        { minLat: 33.2,  maxLat: 33.6,  minLng: 126.1, maxLng: 127.0  },
    incheon:     { minLat: 37.3,  maxLat: 37.7,  minLng: 126.4, maxLng: 126.8  },
    daejeon:     { minLat: 36.1,  maxLat: 36.5,  minLng: 127.2, maxLng: 127.6  },
    daegu:       { minLat: 35.7,  maxLat: 36.0,  minLng: 128.4, maxLng: 128.7  },
    // ── Thailand ──────────────────────────────────────────────────────────────
    phuket:      { minLat: 7.6,   maxLat: 8.3,   minLng: 98.1,  maxLng: 98.65  }, // Phuket island
    bangkok:     { minLat: 13.4,  maxLat: 14.05, minLng: 100.2, maxLng: 100.95 },
    'chiang mai':{ minLat: 18.5,  maxLat: 19.1,  minLng: 98.7,  maxLng: 99.2   },
    pattaya:     { minLat: 12.7,  maxLat: 13.3,  minLng: 100.8, maxLng: 101.2  },
    'koh samui': { minLat: 9.3,   maxLat: 9.7,   minLng: 99.8,  maxLng: 100.1  },
    krabi:       { minLat: 7.5,   maxLat: 8.5,   minLng: 98.5,  maxLng: 99.2   },
    // ── Indonesia ─────────────────────────────────────────────────────────────
    bali:        { minLat: -9.0,  maxLat: -8.0,  minLng: 114.4, maxLng: 115.8  },
    jakarta:     { minLat: -6.5,  maxLat: -5.9,  minLng: 106.5, maxLng: 107.0  },
    // ── Singapore ─────────────────────────────────────────────────────────────
    singapore:   { minLat: 1.1,   maxLat: 1.65,  minLng: 103.55, maxLng: 104.1 },
    // ── Malaysia ──────────────────────────────────────────────────────────────
    'kuala lumpur': { minLat: 2.9, maxLat: 3.4,  minLng: 101.4, maxLng: 101.8  },
    penang:      { minLat: 5.2,   maxLat: 5.6,   minLng: 100.1, maxLng: 100.6  },
    langkawi:    { minLat: 6.2,   maxLat: 6.7,   minLng: 99.6,  maxLng: 100.0  },
    // ── Vietnam ───────────────────────────────────────────────────────────────
    'ho chi minh':{ minLat: 10.5, maxLat: 11.2,  minLng: 106.4, maxLng: 107.1  },
    hanoi:       { minLat: 20.8,  maxLat: 21.3,  minLng: 105.6, maxLng: 106.1  },
    'da nang':   { minLat: 15.9,  maxLat: 16.2,  minLng: 108.0, maxLng: 108.4  },
    // ── Philippines ───────────────────────────────────────────────────────────
    manila:      { minLat: 14.3,  maxLat: 14.8,  minLng: 120.8, maxLng: 121.2  },
    cebu:        { minLat: 10.1,  maxLat: 10.5,  minLng: 123.7, maxLng: 124.1  },
    boracay:     { minLat: 11.9,  maxLat: 12.0,  minLng: 121.9, maxLng: 122.0  },
    // ── UAE / Middle East ─────────────────────────────────────────────────────
    dubai:       { minLat: 24.8,  maxLat: 25.4,  minLng: 54.9,  maxLng: 55.6   },
    'abu dhabi': { minLat: 24.2,  maxLat: 24.6,  minLng: 54.3,  maxLng: 54.7   },
    doha:        { minLat: 25.1,  maxLat: 25.5,  minLng: 51.3,  maxLng: 51.7   },
    // ── Europe ────────────────────────────────────────────────────────────────
    london:      { minLat: 51.3,  maxLat: 51.7,  minLng: -0.5,  maxLng: 0.3    },
    paris:       { minLat: 48.7,  maxLat: 49.1,  minLng: 2.1,   maxLng: 2.6    },
    amsterdam:   { minLat: 52.2,  maxLat: 52.6,  minLng: 4.7,   maxLng: 5.1    },
    barcelona:   { minLat: 41.2,  maxLat: 41.6,  minLng: 1.9,   maxLng: 2.4    },
    madrid:      { minLat: 40.2,  maxLat: 40.6,  minLng: -3.9,  maxLng: -3.5   },
    rome:        { minLat: 41.6,  maxLat: 42.1,  minLng: 12.3,  maxLng: 12.7   },
    // ── Americas ──────────────────────────────────────────────────────────────
    'new york':  { minLat: 40.4,  maxLat: 40.9,  minLng: -74.3, maxLng: -73.7  },
    'los angeles':{ minLat: 33.7, maxLat: 34.3,  minLng: -118.7, maxLng: -118.1 },
    miami:       { minLat: 25.5,  maxLat: 26.0,  minLng: -80.5, maxLng: -80.0  },
    cancun:      { minLat: 21.0,  maxLat: 21.4,  minLng: -86.9, maxLng: -86.6  },
    // ── Oceania ───────────────────────────────────────────────────────────────
    sydney:      { minLat: -34.2, maxLat: -33.6, minLng: 150.5, maxLng: 151.4  },
    melbourne:   { minLat: -38.1, maxLat: -37.6, minLng: 144.6, maxLng: 145.3  },
};

/** Filter OTV portfolio codes by city, language-agnostic (coordinate-first, city-name fallback).
 *  Keeps hotels that: (1) have OTV coords within the city bbox, OR (2) OTV city name loosely
 *  matches the queried city, OR (3) have no coord/city data (can't verify — keep). */
function filterOtvByCity(
    codes: string[],
    contentMap: Map<string, any>,
    cityName: string,
): string[] {
    if (!cityName) return codes;
    const cityKey = cityName.toLowerCase().trim();
    const cityBbox = CITY_BBOX[cityKey];

    const normStr = (s: string) => s.toLowerCase().replace(/[\s\-_\.]/g, '');
    const qNorm = normStr(cityName);

    return codes.filter(code => {
        const c = contentMap.get(code);
        if (!c) return true;

        const lat = Number(c.lat ?? 0);
        const lng = Number(c.lng ?? 0);
        const hasCoords = lat !== 0 || lng !== 0;

        // Coordinate filter (most reliable — language-agnostic)
        if (cityBbox && hasCoords) {
            return lat >= cityBbox.minLat && lat <= cityBbox.maxLat &&
                   lng >= cityBbox.minLng && lng <= cityBbox.maxLng;
        }

        // City-name fallback (when no bbox for this city or hotel has no coords)
        if (c._otvCity) {
            const otvNorm = normStr(c._otvCity);
            return otvNorm.includes(qNorm) || qNorm.includes(otvNorm);
        }

        // No coords, no OTV city → can't verify, keep
        return true;
    });
}

function filterByCountryBbox(
    codes: string[],
    contentMap: Map<string, any>,
    countryCode?: string,
): string[] {
    if (!countryCode) return codes;
    const bbox = COUNTRY_BBOX[countryCode.toUpperCase()];
    if (!bbox) return codes;
    const filtered = codes.filter(code => {
        const c = contentMap.get(code);
        if (!c) return false;
        const lat = c.lat as number;
        const lng = c.lng as number;
        if (!lat && !lng) return false; // no coords → exclude
        return lat >= bbox.minLat && lat <= bbox.maxLat &&
               lng >= bbox.minLng && lng <= bbox.maxLng;
    });
    return filtered;
}

// ─── ETG (RateHawk/WorldOTA) hotel name lookup ───────────────────────────────

/** Fetch hotel names from the ETG B2B API for IDs where OTV returned null hotelName.
 *  ETG and OTV share the same underlying RateHawk data; this endpoint reliably returns names. */
async function fetchEtgHotelNames(hotelIds: string[]): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();
    if (!hotelIds.length) return nameMap;
    const keyId  = process.env.ETG_KEY_ID;
    const apiKey = process.env.ETG_API_KEY;
    if (!keyId || !apiKey) return nameMap;
    const token = Buffer.from(`${keyId}:${apiKey}`).toString('base64');
    const BATCH = 500;
    for (let i = 0; i < hotelIds.length; i += BATCH) {
        const batch = hotelIds.slice(i, i + BATCH);
        try {
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), 5_000);
            const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: batch, language: 'en' }),
                signal: abort.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) { console.warn(`[tgx-search] ETG hotel/info ${res.status}`); continue; }
            const json = await res.json();
            const hotels: any[] = json?.data?.hotels ?? json?.hotels ?? [];
            for (const h of hotels) {
                const id   = String(h.id ?? h.hotel_id ?? '');
                const name = (h.name ?? h.title ?? '') as string;
                if (id && name) nameMap.set(id, name);
            }
        } catch (e: any) {
            if ((e as any)?.name !== 'AbortError') console.warn('[tgx-search] ETG hotel/info batch failed:', e.message);
        }
    }
    console.log(`[tgx-search] ETG hotel/info returned ${nameMap.size}/${hotelIds.length} names`);
    return nameMap;
}

/** Persist ETG-sourced names into hotel_content.
 *  Uses UPSERT so it works whether backfillHotelContent has run yet or not. */
async function updateHotelNamesInDb(nameMap: Map<string, string>): Promise<void> {
    if (!nameMap.size) return;
    const sql = getSqlAdmin();
    let saved = 0;
    for (const [hotelId, name] of nameMap) {
        try {
            await sql`
                INSERT INTO hotel_content (hotel_id, name, images, content_source, fetched_at)
                VALUES (${hotelId}, ${name}, '{}', 'etg', now())
                ON CONFLICT (hotel_id) DO UPDATE SET
                    name       = CASE WHEN hotel_content.name IS NULL OR hotel_content.name = hotel_content.hotel_id
                                      THEN EXCLUDED.name ELSE hotel_content.name END,
                    fetched_at = now()
            `;
            saved++;
        } catch { /* skip individual failures */ }
    }
    if (saved) console.log(`[tgx-search] Upserted ${saved} ETG hotel names into hotel_content`);
}



// ─── Hotel search cache ───────────────────────────────────────────────────────

export const POPULAR_CITIES = new Set([
    'tokyo', 'bangkok', 'seoul', 'singapore', 'paris',
    'london', 'new york', 'dubai', 'barcelona', 'bali',
]);

export function isPopularCity(cityName: string): boolean {
    return POPULAR_CITIES.has(cityName.toLowerCase().trim());
}

export function getEffectiveTtl(cityName?: string): number {
    const standardTtl = parseInt(process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES          ?? '120', 10);
    const popularTtl  = parseInt(process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES   ?? '360', 10);
    return cityName && isPopularCity(cityName) ? popularTtl : standardTtl;
}

function buildHotelCacheKey(p: TgxSearchParams): string {
    const isPoint = (p.rung === 'district' || p.rung === 'poi')
        && Number.isFinite(p.lat) && Number.isFinite(p.lng);
    const location = p.hotelCode
        ? `hotel:${p.hotelCode}`
        : isPoint
        // Round coords (~110m) so near-identical picks share a cache entry; include the
        // rung so a district and a landmark at the same centre (different radius) differ.
        ? `geo:${p.rung}:${Number(p.lat).toFixed(3)},${Number(p.lng).toFixed(3)}`
        : (p.rung === 'country' || p.rung === 'province')
        ? `${p.rung}:${(p.cityName ?? '').toLowerCase().trim()}`
        : p.destinationCode
        ? `dest:${p.destinationCode}`
        : `city:${(p.cityName ?? '').toLowerCase().trim()}`;
    return [
        location,
        p.checkin,
        p.checkout,
        String(p.adults ?? 2),
        String(p.children ?? 0),
        p.guest_nationality ?? 'KR',
    ].join('|');
}

async function getHotelSearchCache(key: string, ttlMinutes: number): Promise<{ result: any; stale: boolean } | null> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql`
            SELECT result, (expires_at <= now()) AS stale
            FROM hotel_search_cache
            WHERE cache_key = ${key}
              AND expires_at > now() - (${ttlMinutes} * interval '1 minute')
            LIMIT 1
        `;
        if (!rows[0]) return null;
        return { result: rows[0].result, stale: Boolean(rows[0].stale) };
    } catch {
        return null;
    }
}

async function setHotelSearchCache(key: string, result: any, ttlMinutes: number): Promise<void> {
    try {
        const sql = getSqlAdmin();
        await sql`
            INSERT INTO hotel_search_cache (cache_key, result, expires_at)
            VALUES (${key}, ${sql.json(result)}, now() + ${`${ttlMinutes} minutes`}::interval)
            ON CONFLICT (cache_key) DO UPDATE
                SET result = EXCLUDED.result, expires_at = EXCLUDED.expires_at, created_at = now()
        `;
        console.log(`[hotel-cache] WRITE ${key} (ttl=${ttlMinutes}min)`);
    } catch (e: any) {
        console.error('[hotel-cache] Write failed (key:', key, '):', e.message);
    }
}

// ─── GraphQL queries ──────────────────────────────────────────────────────────

const CITY_SEARCH_QUERY = `
query TgxCitySearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput!) {
  hotelX {
    search(criteria: $criteria, settings: $settings) {
      options {
        id hotelCode boardCode paymentType status
        price { currency net gross }
        token
        rooms { description }
        cancelPolicy { refundable }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}`;

const HOTEL_SEARCH_QUERY = `
query TgxHotelSearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput!) {
  hotelX {
    search(criteria: $criteria, settings: $settings) {
      options {
        id hotelCode boardCode paymentType status
        price { currency net gross }
        token
        rooms { occupancyRefId code description }
        cancelPolicy {
          refundable
          cancelPenalties { deadline hoursBefore penaltyType currency value }
        }
      }
      errors { code type description }
    }
  }
}`;

// ─── DB enrichment ────────────────────────────────────────────────────────────

async function fetchHotelContent(hotelCodes: string[]) {
    if (!hotelCodes.length) return new Map<string, any>();
    const sql = getSqlAdmin();
    // LEFT JOIN tgx_hotel_static so static CSV data fills in slug names, missing
    // coordinates, and star ratings that hotel_content doesn't have yet.
    const rows = await sql`
        SELECT
            hc.hotel_id,
            COALESCE(NULLIF(TRIM(hc.name), ''), hs.hotel_name, hc.hotel_id) AS name,
            hc.images,
            COALESCE(hc.star_rating, hs.category_code::int)                 AS star_rating,
            COALESCE(NULLIF(hc.lat::text, '0')::numeric, hs.latitude)       AS lat,
            COALESCE(NULLIF(hc.lng::text, '0')::numeric, hs.longitude)      AS lng,
            COALESCE(NULLIF(TRIM(hc.address), ''), hs.address)              AS address,
            COALESCE(NULLIF(TRIM(hc.city), ''), hs.city)                    AS city,
            COALESCE(NULLIF(TRIM(hc.country), ''), hs.country_code)         AS country,
            hc.description,
            hc.amenities,
            hc.review_rating,
            hc.review_count,
            hc.check_in_time,
            hc.check_out_time,
            hc.ratehawk_hid,
            hs.fastx_code
        FROM hotel_content hc
        LEFT JOIN tgx_hotel_static hs ON hs.hotel_code = hc.hotel_id
        WHERE hc.hotel_id = ANY(${hotelCodes})
    `;
    const map = new Map<string, any>();
    for (const row of rows) map.set(row.hotel_id, row);
    return map;
}

async function fetchHotelReviews(hotelCodes: string[]) {
    if (!hotelCodes.length) return new Map<string, any>();
    const sql = getSqlAdmin();
    const rows = await sql`
        SELECT hotel_id, rating, reviews_count
        FROM hotel_reviews
        WHERE hotel_id = ANY(${hotelCodes})
    `;
    const map = new Map<string, any>();
    for (const row of rows) map.set(row.hotel_id, row);
    return map;
}


async function fetchHotelCodesByCity(cityName: string, countryCode?: string): Promise<string[]> {
    const sql = getSqlAdmin();
    // Normalize: strip suffixes like "-si", "-do", "-gu" common in Korean city names
    const cityOnly = cityName.split(',')[0].trim();
    const normalized = cityOnly.replace(/-(si|do|gu|gun|eup)$/i, '').trim();
    const pattern = `%${normalized}%`;
    // Only filter by country when it's a 2-letter ISO code (DB stores "JP" not "Japan")
    const isoCode = countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : null;
    const rows = isoCode
        ? await sql`
            SELECT hotel_id FROM hotel_content
            WHERE city ILIKE ${pattern} AND LOWER(country) = LOWER(${isoCode})
            LIMIT 300
          `
        : await sql`
            SELECT hotel_id FROM hotel_content
            WHERE city ILIKE ${pattern}
            LIMIT 300
          `;
    return rows.map((r: any) => r.hotel_id);
}

// ─── Search params ────────────────────────────────────────────────────────────

export type DestinationRung = 'country' | 'province' | 'city' | 'district' | 'poi';

export interface TgxSearchParams {
    checkin: string;
    checkout: string;
    adults?: number;
    children?: number;
    childrenAges?: number[];
    currency?: string;
    guest_nationality?: string;
    destinationCode?: string;
    cityName?: string;
    countryCode?: string;
    hotelCode?: string;
    rooms?: number;
    /** Granularity ladder rung — drives the resolution path. See ADR-0006. */
    rung?: DestinationRung;
    /** Place centre (point rungs are searched around this via ETG serp/geo). */
    lat?: number;
    lng?: number;
    /** Mapbox bounding box [minLng, minLat, maxLng, maxLat] — sizes a district's circle. */
    bbox?: [number, number, number, number];
    /** Skip the DB cache read — always does a live TGX call. Used by prebook to get genuinely
     *  fresh tokens; result is still written to cache to benefit subsequent requests. */
    bypassCache?: boolean;
}

// ─── Core search function ─────────────────────────────────────────────────────

/** Parse raw TGX portfolio edges into a content map keyed by hotel code. */
function parseOtvEdges(edges: any[], cityName: string, countryCode?: string): Map<string, any> {
    const map = new Map<string, any>();
    for (const e of edges) {
        const d = e?.node?.hotelData;
        if (!d?.code) continue;

        // OTV uses type "GENERAL" for all photos — accept any URL regardless of type
        const images: string[] = (d.medias ?? [])
            .map((m: any) => m.url as string)
            .filter(Boolean)
            .slice(0, 10);

        let description: string | null = null;
        for (const desc of (d.descriptions ?? [])) {
            const en = (desc.texts ?? []).find((t: any) => t.language?.toLowerCase().startsWith('en'));
            if (en?.text) { description = en.text; break; }
        }
        if (!description) description = d.descriptions?.[0]?.texts?.[0]?.text ?? null;

        const catCode: string = d.categoryCode ?? '';
        const starMatch = catCode.match(/(\d)/);

        // Prefer OTV-provided city/country (accurate per-hotel data) over our
        // search parameter (which is the *query* city, not the hotel's actual city).
        const otvCity: string | null    = (d.location?.city as string | null) ?? null;
        const otvCountry: string | null = (d.location?.country as string | null) ?? null;
        map.set(String(d.code), {
            hotel_id:    String(d.code),
            name:        (d.hotelName as string | null) ?? null,
            images,
            lat:         Number(d.location?.coordinates?.latitude  ?? 0),
            lng:         Number(d.location?.coordinates?.longitude ?? 0),
            address:     (d.location?.address as string | null) ?? null,
            city:        otvCity ?? cityName,
            country:     otvCountry ?? countryCode ?? null,
            description,
            star_rating: starMatch ? parseInt(starMatch[1], 10) : 0,
            amenities:   (d.amenities ?? []).map((a: any) => otvCodeToLabel(a.code)).filter(Boolean),
            // Raw OTV city (null when OTV didn't provide one). Used by backfill to know
            // whether to trust this city over an existing DB value (see backfillHotelContent).
            _otvCity:    otvCity,
        });
    }
    return map;
}

/** Query TGX's OTV hotel portfolio to discover hotel codes for a city not yet in our DB.
 *  Returns both codes and the full content map so the caller can use names/images immediately. */
async function fetchOtvHotelCodesByCity(
    cityName: string,
    destinationCode?: string,
    countryCode?: string,
): Promise<{ codes: string[]; contentMap: Map<string, any> }> {
    try {
        const cfg = getTgxConfig();
        const PAGE_SIZE = 500; // TGX Hotels Query max is 500 per page
        // With a dest code or country filter, one page covers the scoped result.
        // Without either, paginate the global catalog (up to 3 pages) as a last resort.
        const MAX_PAGES = (destinationCode || countryCode) ? 2 : 3;
        // token is a top-level variable, NOT inside criteria (TGX Hotels Query API contract)
        const PORTFOLIO_QUERY = `query OtvHotelPortfolio($criteria: HotelXHotelListInput!, $token: String) {
               hotelX {
                 hotels(criteria: $criteria, token: $token) {
                   token
                   edges {
                     node {
                       hotelData {
                         code
                         hotelName
                         categoryCode
                         descriptions { type texts { language text } }
                         medias { url type }
                         location {
                           coordinates { latitude longitude }
                           address
                           city
                           country
                         }
                         amenities { code }
                       }
                     }
                   }
                 }
               }
             }`;

        const allEdges: any[] = [];
        let pageToken: string | null = null;

        for (let page = 0; page < MAX_PAGES; page++) {
            const criteria: Record<string, unknown> = { access: cfg.accessCode, maxSize: PAGE_SIZE };
            if (destinationCode) criteria.destinationCodes = [destinationCode];
            else if (countryCode) criteria.countries = [countryCode.toUpperCase()];

            const result: any = await tgxGraphQL(PORTFOLIO_QUERY, {
                criteria,
                ...(pageToken ? { token: pageToken } : {}),
            });
            const hotelList: any = result?.data?.hotelX?.hotels ?? {};
            const edges: any[] = hotelList.edges ?? [];
            allEdges.push(...edges);
            pageToken = hotelList.token ?? null;
            if (!pageToken || edges.length < PAGE_SIZE) break; // no more pages
        }

        const contentMap = parseOtvEdges(allEdges, cityName, countryCode);
        const codes = [...contentMap.keys()];
        console.log(`[tgx-search] OTV portfolio returned ${codes.length} hotel codes for "${cityName}"`);

        if (codes.length > 0) {
            // Before persisting, drop hotels whose coordinates are confirmed outside the
            // expected country — TGX destination codes sometimes return wrong-country hotels.
            // Hotels with 0,0 coords (OTV data gap) are kept since we can't verify them.
            const bbox = countryCode ? COUNTRY_BBOX[countryCode.toUpperCase()] : null;
            const backfillMap = bbox
                ? new Map([...contentMap].filter(([, c]) => {
                    const lat = Number(c.lat ?? 0);
                    const lng = Number(c.lng ?? 0);
                    if (!lat && !lng) return true;
                    return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
                }))
                : contentMap;
            backfillHotelContent(backfillMap).catch((err: any) =>
                console.warn('[tgx-search] hotel_content backfill failed:', err.message)
            );
            // OTV often has null hotelName for European/global cities.
            // Enrich null-name rows from ETG now so hotel_content (Phase 1 catalog)
            // always shows real names — even when TGX availability returns 0 options.
            const nullNameCodes = codes.filter(c => !contentMap.get(c)?.name);
            if (nullNameCodes.length > 0) {
                fetchEtgHotelNames(nullNameCodes)
                    .then(etgNames => {
                        if (etgNames.size > 0) {
                            // Patch contentMap so the current request can use names too
                            for (const [id, name] of etgNames) {
                                const row = contentMap.get(id);
                                if (row) row.name = name;
                            }
                            updateHotelNamesInDb(etgNames).catch(() => {});
                        }
                    })
                    .catch(() => {});
            }
        }

        return { codes, contentMap };
    } catch (e: any) {
        console.warn('[tgx-search] OTV portfolio query failed:', e.message);
        return { codes: [], contentMap: new Map() };
    }
}

/** Upsert hotel content from a parsed OTV map into hotel_content.
 *  Runs fire-and-forget — never overwrites richer existing data. */
async function backfillHotelContent(contentMap: Map<string, any>): Promise<void> {
    const sql = getSqlAdmin();
    let saved = 0;
    for (const r of contentMap.values()) {
        // Only persist hotels with valid OTV ([A-Z]{2}\d+) or ETG (numeric) codes.
        // LiteAPI legacy slugs (e.g. le_fontainebleau) would otherwise be re-seeded
        // on every search and appear in Phase 1 catalog with no availability.
        if (!/^\d+$/.test(r.hotel_id) && !/^[A-Z]{2}\d+$/.test(r.hotel_id)) continue;
        // When OTV actually provides a city name, overwrite any existing DB city —
        // the existing value may be a stale "query city" fallback from a prior cross-city
        // portfolio fetch (e.g. an Osaka hotel stored as city='Tokyo'). When OTV gives
        // no city we keep the existing DB value via COALESCE.
        const hasOtvCity = r._otvCity !== null && r._otvCity !== undefined;
        try {
            await sql`
                INSERT INTO hotel_content
                    (hotel_id, name, images, lat, lng, address, city, country,
                     description, star_rating, amenities, content_source, fetched_at)
                VALUES (
                    ${r.hotel_id}, ${r.name}, ${sql.array(r.images)},
                    ${r.lat}, ${r.lng}, ${r.address}, ${r.city}, ${r.country},
                    ${r.description}, ${r.star_rating}, ${JSON.stringify(r.amenities)}::jsonb,
                    'tgx', now()
                )
                ON CONFLICT (hotel_id) DO UPDATE SET
                    name        = CASE WHEN hotel_content.name IS NULL
                                       OR hotel_content.name = hotel_content.hotel_id
                                  THEN EXCLUDED.name ELSE hotel_content.name END,
                    images      = CASE WHEN array_length(hotel_content.images, 1) > 0
                                  THEN hotel_content.images ELSE EXCLUDED.images END,
                    lat         = CASE WHEN EXCLUDED.lat  != 0 THEN EXCLUDED.lat  ELSE hotel_content.lat  END,
                    lng         = CASE WHEN EXCLUDED.lng  != 0 THEN EXCLUDED.lng  ELSE hotel_content.lng  END,
                    address     = COALESCE(hotel_content.address,     EXCLUDED.address),
                    city        = CASE WHEN ${hasOtvCity}
                                  THEN EXCLUDED.city
                                  ELSE COALESCE(hotel_content.city, EXCLUDED.city) END,
                    country     = COALESCE(hotel_content.country,     EXCLUDED.country),
                    description = COALESCE(hotel_content.description, EXCLUDED.description),
                    star_rating = CASE WHEN hotel_content.star_rating != 0
                                  THEN hotel_content.star_rating ELSE EXCLUDED.star_rating END,
                    amenities   = CASE WHEN jsonb_array_length(hotel_content.amenities) > 0
                                  THEN hotel_content.amenities ELSE EXCLUDED.amenities END,
                    content_source = COALESCE(hotel_content.content_source, 'tgx'),
                    fetched_at  = now()
            `;
            saved++;
        } catch {
            // Skip individual failures — don't abort the batch
        }
    }
    console.log(`[tgx-search] hotel_content backfilled ${saved} hotels`);
}

/** Collapse punctuation/stopwords so near-identical hotel names (OTV dupes) merge. */
function normalizeHotelName(name: string): string {
    return name
        .toLowerCase()
        .replace(/'/g, '')           // possessives: paul's → pauls (not "paul s")
        .replace(/[^\w\s]/g, ' ')   // other punctuation → space
        .replace(/\b(hotel|the|a|an|london|paris|tokyo|city|of|in|at|by|for|uk|england)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasEmptyHotelsError(errors: any[]): boolean {
    return errors.some(
        (e) => e.code === 'WRONG_FIELD' && e.description?.toLowerCase().includes('empty hotels')
    );
}

// In-process set of TGX destination codes that returned "Empty hotels" for OTV.
// Seeded from DB on first use so cold starts also skip known-bad codes.
const _failedDestCodes = new Set<string>();
let _failedDestCodesPromise: Promise<void> | null = null;

function loadFailedDestCodes(): Promise<void> {
    if (_failedDestCodesPromise) return _failedDestCodesPromise;
    _failedDestCodesPromise = (async () => {
        try {
            const sql = getSqlAdmin();
            const rows = await sql`SELECT dest_code FROM tgx_failed_dest_codes`;
            for (const r of rows) _failedDestCodes.add(r.dest_code as string);
            if (rows.length) console.log(`[tgx-search] Loaded ${rows.length} known-bad dest codes from DB`);
        } catch (e: any) {
            console.warn('[tgx-search] Could not load tgx_failed_dest_codes:', e.message);
        }
    })();
    return _failedDestCodesPromise;
}

/** Clear the in-memory failed-dest-codes set (e.g. after clearing the DB table). */
export function clearFailedDestCodesCache(): void {
    _failedDestCodes.clear();
    _failedDestCodesPromise = null; // force reload from DB on next request
}

function persistFailedDestCode(destCode: string, cityName = ''): void {
    _failedDestCodes.add(destCode);
    getSqlAdmin()`
        INSERT INTO tgx_failed_dest_codes (dest_code, city_key)
        VALUES (${destCode}, ${cityName})
        ON CONFLICT (dest_code) DO NOTHING
    `.catch((e: any) => console.warn('[tgx-search] Could not persist failed dest code:', e.message));
}

// In-flight deduplication: when two requests arrive with the same cache key before
// either has written a result (cache stampede), the second waits for the first
// promise instead of firing a second TGX call that OTV will throttle.
const _inflight = new Map<string, Promise<any>>();

// Tracks keys currently being refreshed in the background (stale-while-revalidate).
// Prevents duplicate background refreshes when multiple requests hit a stale entry.
const _backgroundRefreshing = new Set<string>();

// ─── City search fallback ─────────────────────────────────────────────────────
// Called for every city-name search (OTV never accepts free-text city names as
// destination identifiers) and as the fallback when a destination-code search
// returns empty.

async function runCityFallback(
    cityName: string,
    countryCode: string | undefined,
    baseCriteria: Record<string, unknown>,
    settings: ReturnType<typeof getTgxSettings>,
    prefetchDestCode: Promise<string | undefined>,
    prefetchHotelCodes: Promise<string[]>,
) {
    // Hotel-code chunk searches must NOT use search_by_destination — the plugin is for
    // converting destination codes to hotel codes, not for requests that already carry
    // explicit hotel codes. Using it there expands scope unpredictably.
    const settingsNoPlugin = getTgxSettings(getTgxConfig(), 12_000, false);

    // Ensure the DB-persisted failed codes are loaded before we check the set.
    await loadFailedDestCodes();

    // 1. Try TGX destination code first — gives full city catalog, not just DB snapshot.
    console.warn(`[tgx-search] OTV destination search empty for "${cityName}" — resolving TGX destination code`);
    const resolvedCode = await prefetchDestCode;
    if (resolvedCode) {
        console.log(`[tgx-search] Got TGX destination code "${resolvedCode}" for "${cityName}" — searching`);
        if (_failedDestCodes.has(resolvedCode)) {
            // OTV has no availability for this dest code — skip the 18-22s dest-code
            // round-trip and fall through to the hotel-code path below.
            console.log(`[tgx-search] Dest code "${resolvedCode}" is a known OTV miss — skipping dest-code search for "${cityName}"`);
        } else {
            const __t0 = Date.now();
            let destResult: any;
            try {
                destResult = await tgxGraphQL(CITY_SEARCH_QUERY, {
                    criteria: { ...baseCriteria, destinations: [resolvedCode] },
                    settings,
                }, 13_000);
            } catch (destErr: any) {
                // 513 = TGX handler timeout (dest code returns too many results) — fall through to hotel-code path
                console.warn(`[tgx-search] Dest code "${resolvedCode}" search failed (${destErr.message?.slice(0, 80)}) — falling back to hotel-code search`);
                destResult = null;
            }
            if (!destResult) {
                console.log(`[tgx-search][TIMING] dest-code attempt for "${resolvedCode}" failed after ${Date.now() - __t0}ms`);
                // Don't blacklist — failure is likely a transient TGX overload, not a permanent OTV gap.
            } else {
            console.log(`[tgx-search][TIMING] dest-code round-trip for "${resolvedCode}" took ${Date.now() - __t0}ms`);
            const destOptions: TgxOption[] = destResult?.data?.hotelX?.search?.options || [];
            const destErrors: any[] = destResult?.data?.hotelX?.search?.errors || [];
            const destWarnings: any[] = destResult?.data?.hotelX?.search?.warnings || [];
            if (destWarnings.length) console.warn(`[tgx-search] dest-code warnings for "${resolvedCode}":`, JSON.stringify(destWarnings).slice(0, 500));
            const destMerchant = destOptions.filter(
                (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
            );
            if (destMerchant.length > 0) {
                console.log(`[tgx-search] Destination-code search returned ${destMerchant.length} options for "${cityName}"`);
                // Dest-code path never calls fetchOtvHotelCodesByCity, so hotel_content stays empty.
                // Seed it now (background) so the instant catalog shows up on the next request.
                if (cityName) {
                    fetchOtvHotelCodesByCity(cityName, resolvedCode, countryCode)
                        .then(otv => {
                            if (otv.codes.length > 0) {
                                const nullNames = otv.codes.filter(c => !otv.contentMap.get(c)?.name);
                                if (nullNames.length > 0) {
                                    fetchEtgHotelNames(nullNames)
                                        .then(etgNames => updateHotelNamesInDb(etgNames))
                                        .catch(() => {});
                                }
                            }
                        })
                        .catch(() => {});
                }
                return buildCityResults(destMerchant, cityName, countryCode);
            }
            // No usable MERCHANT options — whether TGX sent an explicit "Empty hotels"
            // error or just a clean empty array (observed for some destination codes,
            // e.g. Tokyo's 504948), this code isn't yielding results either way.
            // Persist so subsequent cold starts also skip this 18-22s round-trip.
            // WRONG_FIELD/Empty hotels = TGX mapping gap (OTV was never called).
            // Don't blacklist — the city may have OTV coverage once TGX mapping syncs.
            if (hasEmptyHotelsError(destErrors)) {
                console.warn(`[tgx-search] Dest code "${resolvedCode}" has TGX mapping gap (Empty hotels) — not recorded as OTV miss`);
            } else {
                persistFailedDestCode(resolvedCode, cityName);
                if (destErrors.length) {
                    console.warn('[tgx-search] Destination-code search errors:', destErrors.map((e: any) => e.description || e.code).join(', '));
                    console.warn(`[tgx-search] Dest code "${resolvedCode}" had errors and 0 merchant options — recorded as OTV miss`);
                } else {
                    console.warn(`[tgx-search] Dest code "${resolvedCode}" returned 0 options with no errors — recorded as OTV miss`);
                }
            }
            } // end else (destResult exists)
        }
    }

    // 2. DB hotel codes (prefetch resolves in <1s — typically already done by now)
    console.warn(`[tgx-search] Destination-code search empty for "${cityName}" — trying hotel-code search`);
    let otvCodes = await prefetchHotelCodes;
    let otvContentMap = new Map<string, any>();

    // Fetch the full OTV portfolio when the DB catalog is empty OR sparse (< 100 hotels).
    // A sparse catalog means prior searches only seeded a handful of hotels, so we'd
    // send TGX only those few codes and miss hundreds of available properties.
    const MIN_PORTFOLIO_SIZE = 100;
    const seedCodes = getSeedCodesForCity(cityName, countryCode);

    if (otvCodes.length < MIN_PORTFOLIO_SIZE) {
        console.log(`[tgx-search] DB has ${otvCodes.length} hotels for "${cityName}" (< ${MIN_PORTFOLIO_SIZE}) — querying OTV portfolio`);
        // Pass undefined (no dest code) so the portfolio query returns the full global
        // OTV catalog filtered only by bbox — dest codes that returned WRONG_FIELD/empty
        // also return empty portfolios, so passing them here would seed nothing.
        const otv = await fetchOtvHotelCodesByCity(cityName, undefined, countryCode);
        // Lenient pre-search filter: only exclude OTV hotels with confirmed wrong-country
        // coordinates. Hotels with lat=0/lng=0 (OTV data gap) are kept — OTV returned them
        // for this city so they're likely valid, and excluding them thins the search pool.
        const otvBbox = countryCode ? COUNTRY_BBOX[countryCode.toUpperCase()] : null;
        const filteredCodes = !otvBbox ? otv.codes : otv.codes.filter(code => {
            const c = otv.contentMap.get(code);
            if (!c) return true;
            const lat = Number(c.lat ?? 0);
            const lng = Number(c.lng ?? 0);
            if (!lat && !lng) return true; // no coords from OTV — trust city assignment
            return lat >= otvBbox.minLat && lat <= otvBbox.maxLat && lng >= otvBbox.minLng && lng <= otvBbox.maxLng;
        });
        if (filteredCodes.length < otv.codes.length) {
            console.warn(`[tgx-search] Filtered ${otv.codes.length - filteredCodes.length} confirmed out-of-country OTV hotels for "${cityName}" (${countryCode})`);
        }
        // City-level filter: coordinate-first, city-name fallback, language-agnostic.
        // Seed codes are always added below regardless of this filter.
        const cityFilteredCodes = filterOtvByCity(filteredCodes, otv.contentMap, cityName);
        if (cityFilteredCodes.length < filteredCodes.length) {
            console.warn(`[tgx-search] City filter: removed ${filteredCodes.length - cityFilteredCodes.length} out-of-city OTV hotels for "${cityName}" (kept ${cityFilteredCodes.length})`);
        }
        // Merge: city-filtered OTV portfolio as base, DB codes fill in any the portfolio missed
        const otvSet = new Set(cityFilteredCodes);
        const merged = [...cityFilteredCodes, ...otvCodes.filter(c => !otvSet.has(c))];
        otvCodes = merged;
        otvContentMap = otv.contentMap;
    } else {
        // Codes exist in DB — sample up to 20 to detect null-name rows (OTV data quality gap).
        // If >40% are nameless, refresh from OTV portfolio so this response can show real names
        // and backfillHotelContent updates the DB for future requests.
        const sample = otvCodes.slice(0, 20);
        const sampleContent = await fetchHotelContent(sample);
        const missingNames = sample.filter(c => !sampleContent.get(c)?.name).length;
        if (missingNames > sample.length * 0.4) {
            console.log(`[tgx-search] ${missingNames}/${sample.length} sampled hotels have no name for "${cityName}" — refreshing OTV portfolio`);
            const otv = await fetchOtvHotelCodesByCity(cityName, resolvedCode ?? undefined, countryCode);
            otvContentMap = otv.contentMap;
            if (otv.codes.length > 0) {
                const bboxFiltered = filterByCountryBbox(otv.codes, otv.contentMap, countryCode);
                otvCodes = filterOtvByCity(bboxFiltered, otv.contentMap, cityName);
            }
        }
    }

    // Supplement with static seed codes for known gap cities (e.g. Tokyo, Phuket).
    // Seeds are confirmed-available hotels from production and may not appear in the
    // portfolio query — always merge them so the chunk search includes them.
    if (seedCodes.length > 0) {
        const existingSet = new Set(otvCodes);
        const newSeeds = seedCodes.filter(c => !existingSet.has(c));
        if (newSeeds.length > 0) {
            console.log(`[tgx-search] Adding ${newSeeds.length} seed codes for "${cityName}" (gap city supplement)`);
            otvCodes = [...otvCodes, ...newSeeds];
            const seedMap = new Map(newSeeds.map(c => [c, { hotel_id: c, name: null, images: [], lat: 0, lng: 0, address: null, city: cityName, country: countryCode ?? null, description: null, star_rating: 0, amenities: [] }]));
            backfillHotelContent(seedMap).catch(() => {});
        }
    }

    if (otvCodes.length > 0) {
        console.log(`[tgx-search] Searching TGX with ${otvCodes.length} OTV hotel codes for "${cityName}"`);

        const CHUNK = 200;
        const CONCURRENCY = 4;
        const chunks: string[][] = [];
        for (let i = 0; i < otvCodes.length; i += CHUNK) chunks.push(otvCodes.slice(i, i + CHUNK));

        const runChunks = async (chunkList: string[][]): Promise<{ options: TgxOption[]; errors: any[] }[]> => {
            const results: { options: TgxOption[]; errors: any[] }[] = [];
            for (let i = 0; i < chunkList.length; i += CONCURRENCY) {
                const batch = chunkList.slice(i, i + CONCURRENCY);
                // allSettled so one chunk's timeout/error doesn't discard other chunks' results
                const settled = await Promise.allSettled(batch.map(async (chunk) => {
                    const r = await tgxGraphQL(CITY_SEARCH_QUERY, {
                        criteria: { ...baseCriteria, hotels: chunk },
                        settings: settingsNoPlugin,
                    }, 13_000);
                    const warnings = r?.data?.hotelX?.search?.warnings;
                    if (warnings?.length) console.warn('[tgx-search] warnings:', JSON.stringify(warnings).slice(0, 500));
                    return {
                        options: (r?.data?.hotelX?.search?.options || []) as TgxOption[],
                        errors:  (r?.data?.hotelX?.search?.errors  || []) as any[],
                    };
                }));
                const batchResults = settled.map(s =>
                    s.status === 'fulfilled'
                        ? s.value
                        : { options: [] as TgxOption[], errors: [{ code: 'CHUNK_ERROR', description: (s.reason as any)?.message?.slice(0, 80) }] }
                );
                results.push(...batchResults);
            }
            return results;
        };

        let chunkResults = await runChunks(chunks);
        let fallbackOptions: TgxOption[] = chunkResults.flatMap(r => r.options);
        const fallbackErrors: any[]       = chunkResults.flatMap(r => r.errors);

        const allProcessesFailed = fallbackErrors.some((e) => e.code === 'ALL_PROCESSES_FAILED');
        // CHUNK_ERROR = our 13s HTTP abort fired before TGX returned ALL_PROCESSES_FAILED —
        // OTV is slower than expected; treat it the same as ALL_PROCESSES_FAILED for retry.
        const allTimedOut = fallbackErrors.length > 0 && fallbackErrors.every((e) => e.code === 'CHUNK_ERROR');

        if ((hasEmptyHotelsError(fallbackErrors) || allProcessesFailed || allTimedOut) && fallbackOptions.length === 0) {
            const waitMs = allProcessesFailed || allTimedOut ? 500 : 1000;
            const reason = allProcessesFailed ? 'ALL_PROCESSES_FAILED' : allTimedOut ? 'all chunks timed out' : 'Empty hotels';
            console.log(`[tgx-search] Hotel-code search failed (${reason}) — retrying in ${waitMs}ms`);
            await new Promise(r => setTimeout(r, waitMs));
            chunkResults = await runChunks(chunks);
            fallbackOptions = chunkResults.flatMap(r => r.options);
        }

        const retryErrors = chunkResults.flatMap(r => r.errors);
        if (retryErrors.length) {
            console.warn('[tgx-search] Hotel-code search errors:', retryErrors.map((e: any) => e.description || e.code).join(', '));
        }

        const fallbackMerchant = fallbackOptions.filter(
            (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
        );
        if (fallbackMerchant.length > 0) {
            return buildCityResults(fallbackMerchant, cityName, countryCode, otvContentMap);
        }
        // OTV codes exist but no MERCHANT availability for these dates
    }

    // No bookable results — return empty rather than ETG fallback hotels which
    // have no MERCHANT payment path and cannot be completed at prebook/book.
    console.warn(`[tgx-search] No MERCHANT availability for "${cityName}" — returning empty`);
    return buildCityResults([], cityName, countryCode);
}

export async function runTgxSearch(params: TgxSearchParams) {
    const key = buildHotelCacheKey(params);
    const ttl = getEffectiveTtl(params.cityName);

    // 1. DB cache hit (fresh or stale-within-grace)
    // Skipped when bypassCache=true so prebook always gets live tokens.
    if (ttl > 0 && !params.bypassCache) {
        const cached = await getHotelSearchCache(key, ttl);
        if (cached !== null) {
            if (!cached.stale) {
                console.log(`[hotel-cache] HIT ${key}`);
                return cached.result;
            }
            // Stale hit: return immediately, kick off background refresh
            console.log(`[hotel-cache] STALE ${key} — serving stale result, refreshing in background`);
            if (!_inflight.has(key) && !_backgroundRefreshing.has(key)) {
                _backgroundRefreshing.add(key);
                _runTgxSearch(params)
                    .then(result => {
                        const hasCityResults = Array.isArray(result?.data) && result.data.length > 0;
                        const hasHotelRooms  = !Array.isArray(result?.data)
                            && Array.isArray(result?.data?.roomTypes)
                            && result.data.roomTypes.length > 0;
                        if (hasCityResults || hasHotelRooms) {
                            setHotelSearchCache(key, result, ttl).catch(() => {});
                        }
                    })
                    .catch((e: any) => console.error('[hotel-cache] Background refresh failed:', e.message))
                    .finally(() => _backgroundRefreshing.delete(key));
            }
            return cached.result;
        }
    }

    // 2. In-flight dedup: attach to existing search for the same key.
    // Also skipped for bypassCache so each prebook gets its own fresh search.
    if (!params.bypassCache) {
        const existing = _inflight.get(key);
        if (existing) {
            console.log(`[hotel-cache] INFLIGHT ${key} — waiting for in-progress search`);
            return existing;
        }
    }

    // 3. Start new search, register in-flight promise
    const promise = _runTgxSearch(params)
        .then(result => {
            if (ttl > 0) {
                // Only cache NON-EMPTY results. City search: result.data is an array;
                // single-hotel: result.data is an object with roomTypes. Caching an empty
                // roomTypes:[] would pin a hotel to "0 rooms" for the whole TTL even after
                // the supplier recovers, so require at least one room/result.
                const hasCityResults = Array.isArray(result?.data) && result.data.length > 0;
                const hasHotelRooms  = !Array.isArray(result?.data)
                    && Array.isArray(result?.data?.roomTypes)
                    && result.data.roomTypes.length > 0;
                if (hasCityResults || hasHotelRooms) {
                    setHotelSearchCache(key, result, ttl).catch(() => {});
                }
                // Empty results are NOT cached — a transient TGX error or OTV availability gap
                // would otherwise pin 0 hotels for all users until the TTL expires. Cross-city
                // contamination is prevented by filterOtvByCity/filterByCountryBbox, not by
                // caching empty results.
            }
            return result;
        })
        .finally(() => { _inflight.delete(key); });

    if (!params.bypassCache) {
        _inflight.set(key, promise);
    }
    return promise;
}

async function _runTgxSearch(params: TgxSearchParams) {
    const {
        checkin, checkout,
        adults = 2, children = 0, childrenAges,
        destinationCode, cityName, countryCode,
        hotelCode,
        guest_nationality = 'KR',
    } = params;

    // OTV/RateHawk prices in USD — always search in USD regardless of display currency.
    const currency = 'USD';

    const settings = getTgxSettings(getTgxConfig(), 12_000, true);
    const occupancies = buildOccupancies(Number(adults), Number(children), childrenAges);

    let destinations: string[] | undefined;
    let hotels: string[] | undefined;

    if (hotelCode) {
        hotels = [String(hotelCode)];
    } else if (destinationCode) {
        destinations = [String(destinationCode)];
    } else if (cityName) {
        // OTV never accepts raw city names as destination identifiers.
        // Skip the guaranteed-to-fail initial call and go straight to hotel-code fallback.
        const baseCriteria = { checkIn: checkin, checkOut: checkout, occupancies, nationality: guest_nationality, currency };

        // If countryCode was not resolved by the caller (e.g. bare city-name search like
        // "Phuket" with no country suffix), infer it from hotel_content so the bbox filter
        // in buildCityResults can remove wrong-country hotels.
        let resolvedCountry: string | undefined = countryCode || undefined;
        if (!resolvedCountry) {
            try {
                const sql = getSqlAdmin();
                const cityOnly = cityName.split(',')[0].trim();
                const rows = await sql<{ country: string; n: bigint }[]>`
                    SELECT country, COUNT(*) AS n
                    FROM hotel_content
                    WHERE city ILIKE ${'%' + cityOnly + '%'}
                      AND country IS NOT NULL AND country != ''
                      AND LENGTH(country) = 2
                    GROUP BY country ORDER BY n DESC LIMIT 1
                `;
                if (rows.length > 0) resolvedCountry = rows[0].country.toUpperCase();
                if (resolvedCountry) console.log(`[tgx-search] inferred countryCode "${resolvedCountry}" for "${cityName}" from hotel_content`);
            } catch {}
        }

        return runCityFallback(
            cityName, resolvedCountry, baseCriteria, settings,
            // Pass undefined so resolution always uses the CITY-keyed DB cache (e.g. "seoul" → 3124).
            // Passing countryCode creates a different key ("seoul:kr") that misses cache, forces a
            // live TGX destinationSearcher call, and often returns undefined on production.
            resolveTgxDestinationCode(cityName, undefined).catch(() => undefined),
            fetchHotelCodesByCity(cityName, resolvedCountry).catch(() => []),
        );
    } else {
        throw new Error('destinationCode, hotelCode, or cityName is required');
    }

    const criteria = {
        checkIn: checkin,
        checkOut: checkout,
        occupancies,
        nationality: guest_nationality,
        currency,
        ...(hotels ? { hotels } : { destinations }),
    };

    const gqlQuery = hotelCode ? HOTEL_SEARCH_QUERY : CITY_SEARCH_QUERY;
    const result = await tgxGraphQL(gqlQuery, { criteria, settings }, 13_000);

    const options: TgxOption[] = result?.data?.hotelX?.search?.options || [];
    const gqlErrors = result?.data?.hotelX?.search?.errors || [];

    // Destination-code search returned empty — fall back to hotel-code search if cityName is available.
    if (hasEmptyHotelsError(gqlErrors) && !hotelCode) {
        if (cityName) {
            const baseCriteria = { checkIn: checkin, checkOut: checkout, occupancies, nationality: guest_nationality, currency };
            return runCityFallback(
                cityName, countryCode, baseCriteria, settings,
                Promise.resolve(undefined),
                fetchHotelCodesByCity(cityName, countryCode).catch(() => []),
            );
        }
        console.warn('[tgx-search] Empty hotels and no cityName to fall back with');
    }

    if (gqlErrors.length) {
        console.warn('[tgx-search] GraphQL errors:', gqlErrors.map((e: any) => e.description || e.code).join(', '));
    }

    // Filter: MERCHANT only (DIRECT = guest pays hotel, incompatible with our model)
    const merchantOptions = options.filter(
        (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
    );

    // ── Single hotel mode ──────────────────────────────────────────────────────
    if (hotelCode) {
        const roomTypes = merchantOptions
            .sort((a, b) => (a.price.gross || a.price.net) - (b.price.gross || b.price.net))
            .map(normalizeOption);

        const [contentMap, reviewMap] = await Promise.all([
            fetchHotelContent([String(hotelCode)]),
            fetchHotelReviews([String(hotelCode)]),
        ]);
        const content = contentMap.get(String(hotelCode));
        const reviews = reviewMap.get(String(hotelCode));
        const imageList: string[] = content?.images ?? [];
        const reviewRating = Number(reviews?.rating ?? content?.review_rating ?? 0);


        return {
            data: {
                roomTypes,
                hotelId:     String(hotelCode),
                name:        content?.name || String(hotelCode),
                images:      imageList,
                image:       imageList[0] ?? '',
                lat:         Number(content?.lat ?? 0),
                lng:         Number(content?.lng ?? 0),
                coordinates: { lat: Number(content?.lat ?? 0), lng: Number(content?.lng ?? 0) },
                address:     content?.address ?? '',
                city:        content?.city ?? '',
                country:     content?.country ?? '',
                description: content?.description ?? '',
                amenities:   content?.amenities ?? [],
                starRating:  content?.star_rating ?? 0,
                reviewRating,
                reviewCount: reviews?.reviews_count ?? content?.review_count ?? 0,
            },
        };
    }

    return buildCityResults(merchantOptions, cityName, countryCode);
}

async function buildCityResults(
    merchantOptions: TgxOption[],
    cityName?: string,
    countryCode?: string,
    preloadedContent: Map<string, any> = new Map(),
) {
    // ── City search mode ───────────────────────────────────────────────────────
    // Keep cheapest option per hotel, cap at 300 before DB enrichment to avoid timeouts.
    const byHotel = new Map<string, TgxOption>();
    for (const opt of merchantOptions) {
        const existing = byHotel.get(opt.hotelCode);
        const price = opt.price.gross || opt.price.net;
        if (!existing || price < (existing.price.gross || existing.price.net)) {
            byHotel.set(opt.hotelCode, opt);
        }
    }

    // Sort cheapest-first, cap at 300 to protect client memory and render budget.
    // Also drop any non-standard codes (LiteAPI slugs etc.) that OTV occasionally
    // returns — they have no availability in TGX and would always show 0 rooms.
    const hotelCodes = Array.from(byHotel.entries())
        .filter(([code]) => /^\d+$/.test(code) || /^[A-Z]{2}\d+$/.test(code))
        .sort(([, a], [, b]) => (a.price.gross || a.price.net) - (b.price.gross || b.price.net))
        .slice(0, 300)
        .map(([code]) => code);
    const [contentMap, reviewMap] = await Promise.all([
        fetchHotelContent(hotelCodes),
        fetchHotelReviews(hotelCodes),
    ]);

    // Filter out hotels whose lat/lng fall outside the expected country bounding box.
    // Lenient: only remove hotels with CONFIRMED wrong-country coordinates. Hotels with
    // no DB/OTV entry, or with zero coordinates, are included — they may be valid hotels
    // we haven't catalogued yet. Excluding them causes "No hotels found" for major cities
    // on first search before hotel_content is seeded.
    const bbox = countryCode ? COUNTRY_BBOX[countryCode.toUpperCase()] : null;
    const filteredCodes = !bbox ? hotelCodes : hotelCodes.filter(code => {
        const c = contentMap.get(code) ?? preloadedContent.get(code);
        if (!c) return true; // not catalogued yet — include
        const lat = Number(c.lat ?? c.latitude ?? 0);
        const lng = Number(c.lng ?? c.longitude ?? 0);
        if (!lat && !lng) return true; // no coordinates — include
        return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
    });
    if (filteredCodes.length < hotelCodes.length) {
        console.warn(`[tgx-search] buildCityResults: filtered ${hotelCodes.length - filteredCodes.length} confirmed out-of-country hotels for "${cityName}" (${countryCode})`);
    }

    // When OTV returns null hotelName (data quality gap for some regions),
    // fall back to ETG hotel/info which uses the same RateHawk data but reliably has names.
    // Wrapped in try/catch — enrichment must never prevent results from rendering.
    if (filteredCodes.length > 0) {
        const noNameCodes = filteredCodes.filter(c => !contentMap.get(c)?.name && !preloadedContent.get(c)?.name);
        if (noNameCodes.length >= hotelCodes.length * 0.3) {
            try {
                const etgNames = await fetchEtgHotelNames(noNameCodes);
                if (etgNames.size > 0) {
                    for (const [code, name] of etgNames) {
                        const row = contentMap.get(code);
                        if (row) { row.name = row.name || name; }
                        else { preloadedContent.set(code, { ...(preloadedContent.get(code) ?? {}), name }); }
                    }
                    updateHotelNamesInDb(etgNames).catch(() => {});
                }
            } catch (e: any) {
                console.warn('[tgx-search] ETG name enrichment skipped:', e.message);
            }
        }
    }

    const hotels_result = filteredCodes.map((code) => {
        const opt     = byHotel.get(code)!;
        const content = contentMap.get(code) ?? preloadedContent.get(code);
        const reviews = reviewMap.get(code);
        const tokenId = opt.token || opt.id;
        const reviewRating = Number(reviews?.rating ?? content?.review_rating ?? 0);
        const imageList: string[] = content?.images ?? [];
        return {
            hotelId:      code,
            id:           code,
            name:         content?.name || preloadedContent.get(code)?.name || code,
            price:        opt.price.gross || opt.price.net,
            currency:     opt.price.currency,
            offerId:      `TGX:${tokenId}`,
            refundableTag: opt.cancelPolicy?.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
            starRating:   content?.star_rating ?? 0,
            images:       imageList,
            image:        imageList[0] ?? '',
            lat:          Number(content?.lat ?? 0),
            lng:          Number(content?.lng ?? 0),
            coordinates:  { lat: Number(content?.lat ?? 0), lng: Number(content?.lng ?? 0) },
            address:      content?.address ?? '',
            location:     content?.address ?? '',
            city:         content?.city ?? cityName ?? '',
            country:      content?.country ?? countryCode ?? '',
            description:  content?.description ?? '',
            amenities:    content?.amenities ?? [],
            reviewRating,
            rating:       reviewRating,
            reviews:      reviews?.reviews_count ?? content?.review_count ?? 0,
            reviewCount:  reviews?.reviews_count ?? content?.review_count ?? 0,
            checkInTime:  content?.check_in_time ?? null,
            checkOutTime: content?.check_out_time ?? null,
            boardCode:    opt.boardCode,
            roomTypes:    [normalizeOption(opt)],
            _tgxToken:    opt.token,
        };
    });

    // Deduplicate: OTV sometimes lists the same property under multiple codes.
    // Hotels are already sorted cheapest-first, so the first occurrence wins.
    const seenNames = new Set<string>();
    const deduped = hotels_result.filter((h) => {
        if (!h.name || h.name === h.hotelId) return true;
        const key = normalizeHotelName(h.name);
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
    });

    const allMappable = deduped.filter((h) => h.lat && h.lng);
    return { data: deduped, allMappable, totalCount: deduped.length };
}

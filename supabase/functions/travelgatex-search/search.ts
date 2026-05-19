export const SEARCH_QUERY = `
query (
  $criteriaSearch: HotelCriteriaSearchInput
  $settings: HotelSettingsInput
  $filterSearch: HotelXFilterSearchInput
) {
  hotelX {
    search(
      criteria: $criteriaSearch
      settings: $settings
      filterSearch: $filterSearch
    ) {
      options {
        id
        hotelCode
        hotelName
        boardCode
        paymentType
        status
        token
        accessCode
        supplierCode
        rateRules
        price {
          currency
          binding
          net
          gross
        }
        cancelPolicy {
          refundable
          cancelPenalties {
            deadline
            penaltyType
            currency
            value
          }
        }
        rooms {
          occupancyRefId
          code
          description
        }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}
`;

export function buildOccupancies(
  adults: number,
  _children: number,
  childrenAges: number[],
  rooms: number
) {
  const adultsPerRoom   = Math.ceil(adults / rooms);
  const childrenPerRoom = Math.ceil(childrenAges.length / rooms);
  let remainingAdults   = adults;
  const remainingAges   = [...childrenAges];
  const occupancies     = [];

  for (let i = 0; i < rooms; i++) {
    const roomAdults = Math.max(Math.min(adultsPerRoom, remainingAdults), 1);
    remainingAdults -= roomAdults;
    const roomAges   = remainingAges.splice(0, childrenPerRoom);

    occupancies.push({
      paxes: [
        ...Array(roomAdults).fill(null).map(() => ({ age: 30 })),
        ...roomAges.map((age: number) => ({ age })),
      ],
    });
  }
  return occupancies;
}

export function groupByHotel(options: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const option of options) {
    const code = option.hotelCode;
    if (!code) continue;
    if (!map.has(code)) {
      map.set(code, option);
    } else {
      const existing      = map.get(code);
      const existingPrice = existing.price?.gross || existing.price?.net || Infinity;
      const newPrice      = option.price?.gross || option.price?.net || Infinity;
      if (newPrice < existingPrice) map.set(code, option);
    }
  }
  return map;
}

// Token format: "33!~|a0!~|b260529!~|c260530!~|d9886890!~|...!~|mJP27!~|..."
// Segments split by '!~|'; 'd' segment = OTV/ETG hotel ID.
export function extractEtgHid(optionId: string): string | null {
  if (!optionId) return null;
  for (const seg of optionId.split('!~|')) {
    if (seg.length > 1 && seg[0] === 'd' && /^\d+$/.test(seg.slice(1))) {
      return seg.slice(1);
    }
  }
  return null;
}

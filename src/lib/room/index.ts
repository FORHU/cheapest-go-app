// Room utilities
export {
    extractRoomPrice,
    hasFreeCancellation,
    normalizeRoomName,
    getRoomDisplayName,
    createRateOption,
    groupRoomsByName,
    findRateByOfferId,
    getRoomImage,
} from './roomUtils';

export type {
    RoomType,
    RoomRate,
    GroupedRoom,
    PriceInfo,
} from './roomUtils';

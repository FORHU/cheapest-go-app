// Room utilities
export {
    extractRoomPrice,
    hasFreeCancellation,
    normalizeRoomName,
    getRoomDisplayName,
    createRateOption,
    groupRoomsByName,
    mergeGroupsByPhotos,
    findRateByOfferId,
    getRoomImage,
} from './roomUtils';

export type {
    RoomType,
    RoomRate,
    GroupedRoom,
    PriceInfo,
} from './roomUtils';

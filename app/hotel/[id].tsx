import { Redirect, useLocalSearchParams } from 'expo-router';
export default function HotelRedirect() {
    const params = useLocalSearchParams();
    return <Redirect href={{ pathname: "/(tabs)/hotel/[id]", params }} />;
}

export interface MockProperty {
    id: string;
    name: string;
    location: string;
    type: string;
    price: number;
    rating: number;
    image: string;
}

export const baguioProperties: MockProperty[] = [
    { id: '1', name: 'The Manor at Camp John Hay', location: 'Baguio City', type: 'Hotel', price: 8500, rating: 4.7, image: 'https://images.unsplash.com/photo-1746166741291-638b9d1a2868?w=400&h=300&fit=crop' },
    { id: '2', name: 'Baguio Country Club', location: 'Baguio City', type: 'Resort', price: 12000, rating: 4.5, image: 'https://images.unsplash.com/photo-1563175544-9759b48523b9?w=400&h=300&fit=crop' },
    { id: '3', name: 'Azalea Residences', location: 'Baguio City', type: 'Aparthotel', price: 5200, rating: 4.3, image: 'https://images.unsplash.com/photo-1690462666233-c710b82d3aef?w=400&h=300&fit=crop' },
];

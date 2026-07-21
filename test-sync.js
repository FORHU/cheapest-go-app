import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjhokdrgjyqhhccpuoaa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG9rZHJnanlxaGhjY3B1b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg5MDI4OCwiZXhwIjoyMDg0NDY2Mjg4fQ.CNNPLs8GsF1KT-iYRRQ6vGcJuYH70bHAsfrpWaqzA3U';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data: hotels, error } = await supabase
      .from('hotel_content')
      .select('hotel_id, name, review_rating, review_count, star_rating');
      
    if (error) throw error;
    
    let total = hotels.length;
    let nonNullRating = hotels.filter(h => h.review_rating !== null).length;
    let nonNullCount = hotels.filter(h => h.review_count !== null).length;
    let hasCountGreaterThanZero = hotels.filter(h => h.review_count > 0).length;

    console.log(`Total hotels: ${total}`);
    console.log(`Hotels with non-null review_rating in hotel_content: ${nonNullRating}`);
    console.log(`Hotels with non-null review_count in hotel_content: ${nonNullCount}`);
    console.log(`Hotels with review_count > 0 in hotel_content: ${hasCountGreaterThanZero}`);
    
    console.log('\nSample hotels with non-null reviews:');
    console.log(hotels.filter(h => h.review_count !== null).slice(0, 10));

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
